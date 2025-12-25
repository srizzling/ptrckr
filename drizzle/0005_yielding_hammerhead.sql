CREATE TABLE `nbn_speed_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`watched_speed_id` integer NOT NULL,
	`provider_name` text NOT NULL,
	`plan_name` text NOT NULL,
	`monthly_price` real NOT NULL,
	`promo_value` real,
	`promo_duration` integer,
	`yearly_cost` real NOT NULL,
	`setup_fee` real DEFAULT 0 NOT NULL,
	`scraped_at` integer NOT NULL,
	FOREIGN KEY (`watched_speed_id`) REFERENCES `watched_nbn_speeds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `watched_nbn_speeds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`speed` integer NOT NULL,
	`label` text NOT NULL,
	`created_at` integer NOT NULL
);
