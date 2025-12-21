CREATE TABLE `notification_configs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer,
	`channel` text DEFAULT 'discord' NOT NULL,
	`webhook_url` text NOT NULL,
	`trigger_type` text DEFAULT 'price_drop' NOT NULL,
	`threshold_value` real,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `price_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_scraper_id` integer NOT NULL,
	`retailer_id` integer NOT NULL,
	`price` real NOT NULL,
	`currency` text DEFAULT 'AUD' NOT NULL,
	`in_stock` integer DEFAULT true NOT NULL,
	`product_url` text,
	`scraped_at` integer NOT NULL,
	FOREIGN KEY (`product_scraper_id`) REFERENCES `product_scrapers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`retailer_id`) REFERENCES `retailers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `product_scrapers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`scraper_id` integer NOT NULL,
	`url` text NOT NULL,
	`scrape_interval_minutes` integer DEFAULT 1440 NOT NULL,
	`last_scraped_at` integer,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scraper_id`) REFERENCES `scrapers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`image_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `retailers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`domain` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scrapers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL
);
