CREATE TABLE `nbn_plans_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`speed_tier` integer NOT NULL,
	`plan_data` text NOT NULL,
	`provider_id` integer NOT NULL,
	`provider_name` text NOT NULL,
	`plan_name` text NOT NULL,
	`monthly_price` real NOT NULL,
	`yearly_cost` real NOT NULL,
	`cached_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `nbn_refresh_state` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`last_refresh_at` integer NOT NULL,
	`last_manual_refresh_at` integer
);
