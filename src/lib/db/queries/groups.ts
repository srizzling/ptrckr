import { eq, desc, and } from 'drizzle-orm';
import { db, groups, productGroups } from '../index';
import type { NewGroup, NewProductGroup } from '../schema';

export async function getGroups() {
  return db.query.groups.findMany({
    orderBy: [desc(groups.createdAt)],
    with: {
      productGroups: {
        with: {
          product: {
            with: {
              productScrapers: {
                with: {
                  scraper: true
                }
              }
            }
          }
        }
      }
    }
  });
}

export async function getGroupById(id: number) {
  return db.query.groups.findFirst({
    where: eq(groups.id, id),
    with: {
      productGroups: {
        with: {
          product: true
        }
      }
    }
  });
}

export async function createGroup(data: NewGroup) {
  const result = db.insert(groups).values(data).returning();
  return result.get();
}

export async function updateGroup(id: number, data: Partial<NewGroup>) {
  const result = db.update(groups).set(data).where(eq(groups.id, id)).returning();
  return result.get();
}

export async function deleteGroup(id: number) {
  return db.delete(groups).where(eq(groups.id, id));
}

export async function addProductToGroup(productId: number, groupId: number) {
  // Check if already exists
  const existing = await db.query.productGroups.findFirst({
    where: and(eq(productGroups.productId, productId), eq(productGroups.groupId, groupId))
  });

  if (existing) {
    return existing;
  }

  const result = db.insert(productGroups).values({ productId, groupId }).returning();
  return result.get();
}

export async function removeProductFromGroup(productId: number, groupId: number) {
  return db
    .delete(productGroups)
    .where(and(eq(productGroups.productId, productId), eq(productGroups.groupId, groupId)));
}

export async function getGroupsForProduct(productId: number) {
  const results = await db.query.productGroups.findMany({
    where: eq(productGroups.productId, productId),
    with: {
      group: true
    }
  });

  return results.map((pg) => pg.group);
}
