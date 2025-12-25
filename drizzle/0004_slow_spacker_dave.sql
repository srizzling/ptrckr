CREATE TABLE `scraper_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_scraper_id` integer NOT NULL,
	`status` text NOT NULL,
	`prices_found` integer DEFAULT 0 NOT NULL,
	`prices_saved` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`logs` text,
	`duration_ms` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_scraper_id`) REFERENCES `product_scrapers`(`id`) ON UPDATE no action ON DELETE cascade
);
