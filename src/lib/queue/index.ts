import PQueue from 'p-queue';
import { runScraper, type ScraperRunResult } from '../scrapers';
import { markScraperAsRun, getProductScraperById } from '../db/queries/scrapers';
import { checkNotifications } from '../notifications';
import type { ProductScraper, Scraper as ScraperModel, Product } from '../db/schema';

export type QueueItemStatus = 'pending' | 'running' | 'success' | 'warning' | 'error';

export interface QueueItem {
  id: string;
  productScraperId: number;
  productId: number;
  productName: string;
  scraperName: string;
  status: QueueItemStatus;
  pricesSaved?: number;
  error?: string;
  addedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  source: 'manual' | 'scheduled' | 'group';
  groupId?: number;
  groupName?: string;
}

export interface QueueState {
  items: QueueItem[];
  pending: number;
  size: number;
  isProcessing: boolean;
  processedCount: number;
  lastProcessedAt: Date | null;
}

type QueueListener = (state: QueueState) => void;

class ScraperQueue {
  private pqueue: PQueue;
  private items: Map<string, QueueItem> = new Map();
  private processedCount = 0;
  private lastProcessedAt: Date | null = null;
  private listeners: Map<string, QueueListener> = new Map();
  private idCounter = 0;

  constructor() {
    // Process one scraper at a time with 2 minute delay between each
    // This helps avoid rate limiting from browserless and target sites
    this.pqueue = new PQueue({
      concurrency: 1,
      interval: 120000,  // 2 minutes between scrapes
      intervalCap: 1     // Only 1 scrape per interval
    });

    // Listen to queue events
    this.pqueue.on('idle', () => {
      this.notifyListeners();
    });

    this.pqueue.on('active', () => {
      this.notifyListeners();
    });
  }

  private generateId(): string {
    return `q_${Date.now()}_${this.idCounter++}`;
  }

  getState(): QueueState {
    return {
      items: Array.from(this.items.values()),
      pending: this.pqueue.pending,
      size: this.pqueue.size,
      isProcessing: this.pqueue.pending > 0 || this.pqueue.size > 0,
      processedCount: this.processedCount,
      lastProcessedAt: this.lastProcessedAt
    };
  }

  subscribe(id: string, listener: QueueListener): () => void {
    this.listeners.set(id, listener);
    // Send initial state
    listener(this.getState());
    return () => this.listeners.delete(id);
  }

  private notifyListeners() {
    const state = this.getState();
    for (const listener of this.listeners.values()) {
      try {
        listener(state);
      } catch (e) {
        console.error('[Queue] Listener error:', e);
      }
    }
  }

  private cleanupOldItems() {
    // Keep only last 100 completed items
    const items = Array.from(this.items.values());
    const completedItems = items.filter(
      (i) => i.status !== 'pending' && i.status !== 'running'
    );
    if (completedItems.length > 100) {
      // Sort by completion time and remove oldest
      completedItems.sort((a, b) =>
        (a.completedAt?.getTime() || 0) - (b.completedAt?.getTime() || 0)
      );
      const toRemove = completedItems.slice(0, completedItems.length - 100);
      for (const item of toRemove) {
        this.items.delete(item.id);
      }
    }
  }

  add(
    productScraper: ProductScraper & { scraper: ScraperModel; product: Product },
    source: 'manual' | 'scheduled' | 'group',
    groupInfo?: { groupId: number; groupName: string }
  ): QueueItem {
    const item: QueueItem = {
      id: this.generateId(),
      productScraperId: productScraper.id,
      productId: productScraper.product.id,
      productName: productScraper.product.name,
      scraperName: productScraper.scraper.name,
      status: 'pending',
      addedAt: new Date(),
      source,
      ...(groupInfo && { groupId: groupInfo.groupId, groupName: groupInfo.groupName })
    };

    this.items.set(item.id, item);
    this.notifyListeners();

    // Add to p-queue
    this.pqueue.add(() => this.processItem(item));

    return item;
  }

  addMultiple(
    productScrapers: Array<ProductScraper & { scraper: ScraperModel; product: Product }>,
    source: 'manual' | 'scheduled' | 'group',
    groupInfo?: { groupId: number; groupName: string }
  ): QueueItem[] {
    const items = productScrapers.map((ps) => {
      const item: QueueItem = {
        id: this.generateId(),
        productScraperId: ps.id,
        productId: ps.product.id,
        productName: ps.product.name,
        scraperName: ps.scraper.name,
        status: 'pending',
        addedAt: new Date(),
        source,
        ...(groupInfo && { groupId: groupInfo.groupId, groupName: groupInfo.groupName })
      };
      this.items.set(item.id, item);
      return item;
    });

    this.notifyListeners();

    // Add all to p-queue
    for (const item of items) {
      this.pqueue.add(() => this.processItem(item));
    }

    return items;
  }

  private async processItem(item: QueueItem): Promise<void> {
    // Mark as running
    item.status = 'running';
    item.startedAt = new Date();
    this.notifyListeners();

    try {
      // Get the full product scraper data from DB
      const productScraper = await getProductScraperById(item.productScraperId);

      if (!productScraper) {
        throw new Error('Scraper not found');
      }

      console.log(`[Queue] Running: ${item.scraperName} for ${item.productName}`);
      const result = await runScraper(productScraper);

      // Update DB status
      const scraperStatus = result.status === 'error' ? 'error' : (result.status === 'warning' ? 'warning' : 'success');
      await markScraperAsRun(item.productScraperId, scraperStatus, result.errorMessage);

      // Check notifications
      if (result.pricesFound > 0) {
        await checkNotifications(item.productId);
      }

      // Update queue item
      item.status = result.status;
      item.pricesSaved = result.pricesSaved;
      if (result.errorMessage) {
        item.error = result.errorMessage;
      }

      console.log(`[Queue] Completed: ${item.scraperName} - ${result.pricesSaved} prices (${result.status})`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Queue] Error for ${item.scraperName}:`, errorMessage);
      await markScraperAsRun(item.productScraperId, 'error', errorMessage);
      item.status = 'error';
      item.error = errorMessage;
    }

    item.completedAt = new Date();
    this.processedCount++;
    this.lastProcessedAt = new Date();
    this.cleanupOldItems();
    this.notifyListeners();
  }

  getPendingCount(): number {
    return this.pqueue.size;
  }

  getRunningCount(): number {
    return this.pqueue.pending;
  }

  getRunningItem(): QueueItem | undefined {
    return Array.from(this.items.values()).find((i) => i.status === 'running');
  }

  getRecentItems(limit = 20): QueueItem[] {
    return Array.from(this.items.values())
      .sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime())
      .slice(0, limit);
  }

  getItemsByGroup(groupId: number): QueueItem[] {
    return Array.from(this.items.values())
      .filter((i) => i.groupId === groupId)
      .sort((a, b) => a.addedAt.getTime() - b.addedAt.getTime());
  }

  // Wait for all current items to complete
  async onIdle(): Promise<void> {
    return this.pqueue.onIdle();
  }

  // Pause the queue
  pause(): void {
    this.pqueue.pause();
    this.notifyListeners();
  }

  // Resume the queue
  start(): void {
    this.pqueue.start();
    this.notifyListeners();
  }

  isPaused(): boolean {
    return this.pqueue.isPaused;
  }

  clear(): void {
    this.pqueue.clear();
    // Remove all pending items from our tracking
    for (const [id, item] of this.items) {
      if (item.status === 'pending') {
        this.items.delete(id);
      }
    }
    this.notifyListeners();
  }
}

// Singleton instance
export const scraperQueue = new ScraperQueue();
