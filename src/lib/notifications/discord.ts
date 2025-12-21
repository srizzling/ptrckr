import type { NotificationChannel, NotificationPayload } from './types';

export class DiscordNotification implements NotificationChannel {
  type = 'discord';

  async send(webhookUrl: string, payload: NotificationPayload): Promise<boolean> {
    try {
      const color = payload.changeType === 'drop' ? 0x22c55e : // green
                    payload.changeType === 'increase' ? 0xef4444 : // red
                    0x3b82f6; // blue for new

      const emoji = payload.changeType === 'drop' ? '📉' :
                    payload.changeType === 'increase' ? '📈' : '🆕';

      const title = payload.changeType === 'drop' ? 'Price Drop!' :
                    payload.changeType === 'increase' ? 'Price Increase' : 'New Price';

      const priceChange = payload.oldPrice && payload.changePercent
        ? `${payload.changeType === 'drop' ? '-' : '+'}${Math.abs(payload.changePercent).toFixed(1)}%`
        : '';

      const oldPriceFormatted = payload.oldPrice
        ? new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(payload.oldPrice)
        : 'N/A';

      const newPriceFormatted = new Intl.NumberFormat('en-AU', {
        style: 'currency',
        currency: 'AUD'
      }).format(payload.newPrice);

      const embed = {
        title: `${emoji} ${title}`,
        description: payload.productName,
        color,
        fields: [
          {
            name: 'Retailer',
            value: payload.retailerName,
            inline: true
          },
          {
            name: 'New Price',
            value: newPriceFormatted,
            inline: true
          },
          ...(payload.oldPrice
            ? [
                {
                  name: 'Previous Price',
                  value: `${oldPriceFormatted} (${priceChange})`,
                  inline: true
                }
              ]
            : [])
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: 'Ptrckr Price Tracker'
        }
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          embeds: [embed]
        })
      });

      if (!response.ok) {
        console.error('[Discord] Failed to send notification:', response.status);
        return false;
      }

      console.log('[Discord] Notification sent successfully');
      return true;
    } catch (error) {
      console.error('[Discord] Error sending notification:', error);
      return false;
    }
  }
}

export const discordNotification = new DiscordNotification();
