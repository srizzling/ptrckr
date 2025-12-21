import { eq, isNull, or, desc } from 'drizzle-orm';
import { db, notificationConfigs } from '../index';
import type { NewNotificationConfig } from '../schema';

export async function getNotificationConfigs() {
  return db.query.notificationConfigs.findMany({
    orderBy: [desc(notificationConfigs.createdAt)],
    with: {
      product: true
    }
  });
}

export async function getNotificationConfigById(id: number) {
  return db.query.notificationConfigs.findFirst({
    where: eq(notificationConfigs.id, id),
    with: {
      product: true
    }
  });
}

export async function getNotificationConfigsForProduct(productId: number) {
  return db.query.notificationConfigs.findMany({
    where: or(
      eq(notificationConfigs.productId, productId),
      isNull(notificationConfigs.productId) // Global configs
    ),
    with: {
      product: true
    }
  });
}

export async function getEnabledNotificationConfigs() {
  return db.query.notificationConfigs.findMany({
    where: eq(notificationConfigs.enabled, true),
    with: {
      product: true
    }
  });
}

export async function createNotificationConfig(data: NewNotificationConfig) {
  const result = db.insert(notificationConfigs).values(data).returning();
  return result.get();
}

export async function updateNotificationConfig(id: number, data: Partial<NewNotificationConfig>) {
  const result = db
    .update(notificationConfigs)
    .set(data)
    .where(eq(notificationConfigs.id, id))
    .returning();
  return result.get();
}

export async function deleteNotificationConfig(id: number) {
  return db.delete(notificationConfigs).where(eq(notificationConfigs.id, id));
}

export async function getGlobalNotificationConfigs() {
  return db.query.notificationConfigs.findMany({
    where: isNull(notificationConfigs.productId)
  });
}
