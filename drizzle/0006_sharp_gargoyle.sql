CREATE TABLE `user_nbn_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`watched_speed_id` integer NOT NULL,
	`provider_name` text,
	`monthly_price` real NOT NULL,
	`promo_discount` real DEFAULT 0,
	`promo_ends_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`watched_speed_id`) REFERENCES `watched_nbn_speeds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_nbn_plans_watched_speed_id_unique` ON `user_nbn_plans` (`watched_speed_id`);