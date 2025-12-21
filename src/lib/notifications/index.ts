import { discordNotification } from './discord';
import type { NotificationChannel, NotificationPayload } from './types';
import { getNotificationConfigsForProduct } from '../db/queries/notifications';
import { getLatestPricesForProduct, getPreviousLowestPrice } from '../db/queries/prices';
import { getProductById } from '../db/queries/products';

// Registry of notification channels
const channels: Record<string, NotificationChannel> = {
  discord: discordNotification
};

export function getChannel(type: string): NotificationChannel | undefined {
  return channels[type];
}

export async function checkNotifications(productId: number): Promise<void> {
  try {
    const product = await getProductById(productId);
    if (!product) {
      console.log(`[Notifications] Product ${productId} not found`);
      return;
    }

    const configs = await getNotificationConfigsForProduct(productId);
    const enabledConfigs = configs.filter((c) => c.enabled);

    if (enabledConfigs.length === 0) {
      console.log(`[Notifications] No enabled configs for product ${productId}`);
      return;
    }

    const latestPrices = await getLatestPricesForProduct(productId);
    if (latestPrices.length === 0) {
      console.log(`[Notifications] No prices for product ${productId}`);
      return;
    }

    const currentLowest = latestPrices[0];
    const previousLowest = await getPreviousLowestPrice(productId);

    console.log(
      `[Notifications] Product ${product.name}: current=$${currentLowest.price}, previous=${previousLowest ? '$' + previousLowest : 'N/A'}`
    );

    for (const config of enabledConfigs) {
      let shouldNotify = false;
      let changeType: 'drop' | 'increase' | 'new' = 'new';

      if (previousLowest === null) {
        // First price - notify for new
        if (config.triggerType === 'any_change') {
          shouldNotify = true;
          changeType = 'new';
        }
      } else {
        const priceDiff = currentLowest.price - previousLowest;
        const changePercent = (priceDiff / previousLowest) * 100;

        switch (config.triggerType) {
          case 'price_drop':
            if (priceDiff < 0) {
              shouldNotify = true;
              changeType = 'drop';
            }
            break;

          case 'price_increase':
            if (priceDiff > 0) {
              shouldNotify = true;
              changeType = 'increase';
            }
            break;

          case 'any_change':
            if (priceDiff !== 0) {
              shouldNotify = true;
              changeType = priceDiff < 0 ? 'drop' : 'increase';
            }
            break;

          case 'below_threshold':
            if (
              config.thresholdValue !== null &&
              currentLowest.price <= config.thresholdValue &&
              (previousLowest > config.thresholdValue || previousLowest === null)
            ) {
              shouldNotify = true;
              changeType = 'drop';
            }
            break;
        }

        if (shouldNotify) {
          const payload: NotificationPayload = {
            productId: product.id,
            productName: product.name,
            oldPrice: previousLowest,
            newPrice: currentLowest.price,
            retailerName: currentLowest.retailerName,
            changeType,
            changePercent: Math.abs((priceDiff / previousLowest) * 100),
            productUrl: currentLowest.productUrl || undefined
          };

          const channel = getChannel(config.channel);
          if (channel) {
            console.log(
              `[Notifications] Sending ${config.channel} notification for ${product.name}`
            );
            await channel.send(config.webhookUrl, payload);
          } else {
            console.log(
              `[Notifications] Unknown channel: ${config.channel}`
            );
          }
        }
      }
    }
  } catch (error) {
    console.error('[Notifications] Error checking notifications:', error);
  }
}

export async function sendTestNotification(
  channel: string,
  webhookUrl: string
): Promise<boolean> {
  const notificationChannel = getChannel(channel);
  if (!notificationChannel) {
    return false;
  }

  const testPayload: NotificationPayload = {
    productId: 0,
    productName: 'Test Product',
    oldPrice: 199.99,
    newPrice: 149.99,
    retailerName: 'Test Retailer',
    changeType: 'drop',
    changePercent: 25
  };

  return notificationChannel.send(webhookUrl, testPayload);
}

export type { NotificationPayload, NotificationChannel };
