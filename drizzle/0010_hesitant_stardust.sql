CREATE TABLE `nbn_refresh_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`watched_speed_id` integer NOT NULL,
	`status` text NOT NULL,
	`plans_fetched` integer DEFAULT 0 NOT NULL,
	`plans_cached` integer DEFAULT 0 NOT NULL,
	`snapshots_saved` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`logs` text,
	`duration_ms` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`watched_speed_id`) REFERENCES `watched_nbn_speeds`(`id`) ON UPDATE no action ON DELETE cascade
);
