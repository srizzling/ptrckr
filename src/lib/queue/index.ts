import PQueue from 'p-queue';
import { runScraper, type ScraperRunResult } from '../scrapers';
import { markScraperAsRun, getProductScraperById } from '../db/queries/scrapers';
import { checkNotifications } from '../notifications';
import { refreshNbnSpeed } from '../nbn/refresh';
import { getWatchedSpeeds } from '../db/queries/nbn';
import { getSettingNumber } from '../db/queries/settings';
import type { ProductScraper, Scraper as ScraperModel, Product } from '../db/schema';

export type QueueItemStatus = 'pending' | 'running' | 'success' | 'warning' | 'error';
export type QueueItemType = 'scraper' | 'nbn';

export interface QueueItem {
  id: string;
  type: QueueItemType;
  // Scraper-specific fields
  productScraperId?: number;
  productId?: number;
  productName: string;
  scraperName: string;
  scraperRunId?: number; // ID of the scraper_runs record
  // NBN-specific fields
  nbnSpeedTier?: number;
  nbnSpeedLabel?: string;
  nbnWatchedSpeedId?: number;
  nbnRefreshRunId?: number;
  // Common fields
  status: QueueItemStatus;
  pricesSaved?: number;
  error?: string;
  addedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  source: 'manual' | 'scheduled' | 'group' | 'nbn';
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
  intervalMs: number; // Time between scrapes
  nextRunAt: Date | null; // Estimated time for next item to start
}

type QueueListener = (state: QueueState) => void;

class ScraperQueue {
  private pqueue: PQueue;
  private items: Map<string, QueueItem> = new Map();
  private processedCount = 0;
  private lastProcessedAt: Date | null = null;
  private listeners: Map<string, QueueListener> = new Map();
  private idCounter = 0;
  private initialized = false;
  private currentInterval = 120000; // Default interval

  private get intervalMs(): number {
    return getSettingNumber('queue_interval_ms', 120000);
  }

  constructor() {
    // Use hardcoded default at construction time (before migrations run)
    // Call init() after migrations to use settings value
    this.pqueue = this.createPQueue(120000);
  }

  private createPQueue(interval: number): PQueue {
    const queue = new PQueue({
      concurrency: 1,
      interval,
      intervalCap: 1
    });

    queue.on('idle', () => {
      this.notifyListeners();
    });

    queue.on('active', () => {
      this.notifyListeners();
    });

    return queue;
  }

  /**
   * Initialize the queue with settings from the database.
   * Call this after migrations have run and after settings change.
   */
  init() {
    const interval = this.intervalMs;

    // Skip if already initialized with same interval
    if (this.initialized && this.currentInterval === interval) {
      return;
    }

    console.log(`[Queue] Initializing with interval: ${interval}ms`);
    this.pqueue = this.createPQueue(interval);
    this.currentInterval = interval;
    this.initialized = true;
  }

  private generateId(): string {
    return `q_${Date.now()}_${this.idCounter++}`;
  }

  getState(): QueueState {
    // Calculate next run time based on last processed time
    let nextRunAt: Date | null = null;
    const pendingItems = Array.from(this.items.values()).filter(i => i.status === 'pending');
    const runningItem = Array.from(this.items.values()).find(i => i.status === 'running');

    if (pendingItems.length > 0 && !runningItem) {
      // If there's pending items but nothing running, next run is based on last completion + interval
      if (this.lastProcessedAt) {
        nextRunAt = new Date(this.lastProcessedAt.getTime() + this.intervalMs);
      } else {
        nextRunAt = new Date(); // Start immediately if never processed
      }
    }

    return {
      items: Array.from(this.items.values()),
      pending: this.pqueue.pending,
      size: this.pqueue.size,
      isProcessing: this.pqueue.pending > 0 || this.pqueue.size > 0,
      processedCount: this.processedCount,
      lastProcessedAt: this.lastProcessedAt,
      intervalMs: this.intervalMs,
      nextRunAt
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
  ): QueueItem | null {
    // Only deduplicate for scheduled runs - manual runs always go through
    if (source !== 'manual') {
      const existingItem = Array.from(this.items.values()).find(
        (i) => i.productScraperId === productScraper.id && (i.status === 'pending' || i.status === 'running')
      );
      if (existingItem) {
        return null; // Already in queue
      }
    }

    const item: QueueItem = {
      id: this.generateId(),
      type: 'scraper',
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
    // Get IDs of scrapers already pending or running
    const activeScraperIds = new Set(
      Array.from(this.items.values())
        .filter((i) => i.productScraperId && (i.status === 'pending' || i.status === 'running'))
        .map((i) => i.productScraperId)
    );

    // Filter out duplicates
    const newScrapers = productScrapers.filter((ps) => !activeScraperIds.has(ps.id));

    if (newScrapers.length === 0) {
      return [];
    }

    const items = newScrapers.map((ps) => {
      const item: QueueItem = {
        id: this.generateId(),
        type: 'scraper',
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

  addNbnRefresh(speedTier: number, speedLabel: string, source: 'manual' | 'scheduled' = 'scheduled'): QueueItem | null {
    // Only deduplicate for scheduled runs - manual runs always go through
    if (source !== 'manual') {
      const existingItem = Array.from(this.items.values()).find(
        (i) => i.type === 'nbn' && i.nbnSpeedTier === speedTier && (i.status === 'pending' || i.status === 'running')
      );
      if (existingItem) {
        return null; // Already in queue
      }
    }

    const item: QueueItem = {
      id: this.generateId(),
      type: 'nbn',
      nbnSpeedTier: speedTier,
      nbnSpeedLabel: speedLabel,
      productName: `NBN ${speedLabel}`,
      scraperName: 'NBN Plans',
      status: 'pending',
      addedAt: new Date(),
      source: source === 'manual' ? 'manual' : 'nbn'
    };

    this.items.set(item.id, item);
    this.notifyListeners();

    // Add to p-queue
    this.pqueue.add(() => this.processNbnItem(item));

    return item;
  }

  addNbnRefreshMultiple(speeds: Array<{ speed: number; label: string }>, source: 'manual' | 'scheduled' = 'scheduled'): QueueItem[] {
    // Get speed tiers already pending or running
    const activeSpeedTiers = new Set(
      Array.from(this.items.values())
        .filter((i) => i.type === 'nbn' && (i.status === 'pending' || i.status === 'running'))
        .map((i) => i.nbnSpeedTier)
    );

    // Filter out duplicates
    const newSpeeds = speeds.filter((s) => !activeSpeedTiers.has(s.speed));

    if (newSpeeds.length === 0) {
      return [];
    }

    const items = newSpeeds.map((s) => {
      const item: QueueItem = {
        id: this.generateId(),
        type: 'nbn',
        nbnSpeedTier: s.speed,
        nbnSpeedLabel: s.label,
        productName: `NBN ${s.label}`,
        scraperName: 'NBN Plans',
        status: 'pending',
        addedAt: new Date(),
        source: source === 'manual' ? 'manual' : 'nbn'
      };
      this.items.set(item.id, item);
      return item;
    });

    this.notifyListeners();

    // Add all to p-queue
    for (const item of items) {
      this.pqueue.add(() => this.processNbnItem(item));
    }

    return items;
  }

  private async processItem(item: QueueItem): Promise<void> {
    // Mark as running
    item.status = 'running';
    item.startedAt = new Date();
    this.notifyListeners();

    try {
      if (!item.productScraperId) {
        throw new Error('Product scraper ID not specified');
      }

      // Get the full product scraper data from DB
      const productScraper = await getProductScraperById(item.productScraperId);

      if (!productScraper) {
        throw new Error('Scraper not found');
      }

      console.log(`[Queue] Running: ${item.scraperName} for ${item.productName}`);
      // Manual runs bypass cache, scheduled runs respect cache
      const force = item.source === 'manual' || item.source === 'group';
      const result = await runScraper(productScraper, { force });

      // Handle cached results - mark as cached with previous prices count
      if (result.status === 'cached') {
        item.status = 'success'; // Show as success in queue (green checkmark)
        item.pricesSaved = result.pricesSaved;
        item.scraperRunId = result.runId;
        console.log(`[Queue] Cached: ${item.scraperName} - using ${result.pricesFound} prices from previous run`);
      } else {
        // Update DB status
        const scraperStatus = result.status === 'error' ? 'error' : (result.status === 'warning' ? 'warning' : 'success');
        await markScraperAsRun(item.productScraperId, scraperStatus, result.errorMessage);

        // Check notifications
        if (result.pricesFound > 0 && item.productId) {
          await checkNotifications(item.productId);
        }

        // Update queue item
        item.status = result.status;
        item.pricesSaved = result.pricesSaved;
        item.scraperRunId = result.runId;
        if (result.errorMessage) {
          item.error = result.errorMessage;
        }

        console.log(`[Queue] Completed: ${item.scraperName} - ${result.pricesSaved} prices (${result.status})`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Queue] Error for ${item.scraperName}:`, errorMessage);
      if (item.productScraperId) {
        await markScraperAsRun(item.productScraperId, 'error', errorMessage);
      }
      item.status = 'error';
      item.error = errorMessage;
    }

    item.completedAt = new Date();
    this.processedCount++;
    this.lastProcessedAt = new Date();
    this.cleanupOldItems();
    this.notifyListeners();
  }

  private async processNbnItem(item: QueueItem): Promise<void> {
    // Mark as running
    item.status = 'running';
    item.startedAt = new Date();
    this.notifyListeners();

    try {
      if (!item.nbnSpeedTier) {
        throw new Error('NBN speed tier not specified');
      }

      console.log(`[Queue] Running NBN refresh: ${item.nbnSpeedLabel || item.nbnSpeedTier}`);

      // Find the watched speed for this tier
      const watchedSpeeds = await getWatchedSpeeds();
      const watchedSpeed = watchedSpeeds.find((ws) => ws.speed === item.nbnSpeedTier);

      if (!watchedSpeed) {
        throw new Error(`Speed tier ${item.nbnSpeedTier} is not being watched`);
      }

      // Store the watched speed ID for later reference
      item.nbnWatchedSpeedId = watchedSpeed.id;

      const result = await refreshNbnSpeed(watchedSpeed);

      item.status = result.success ? 'success' : (result.errorMessage ? 'error' : 'warning');
      item.nbnRefreshRunId = result.runId;
      item.pricesSaved = result.plansFetched;

      if (result.errorMessage) {
        item.error = result.errorMessage;
      }

      console.log(`[Queue] NBN refresh completed: ${item.nbnSpeedLabel} - ${result.plansFetched} plans fetched`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Queue] NBN error for ${item.nbnSpeedLabel}:`, errorMessage);
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
