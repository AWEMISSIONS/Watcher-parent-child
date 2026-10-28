CREATE TABLE `watcher_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`guardian_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`pair_hash` text,
	`pair_expires` integer,
	`token_hash` text,
	`revoked` integer DEFAULT 0 NOT NULL,
	`last_seen` integer,
	`platform` text DEFAULT 'unknown' NOT NULL,
	`coverage` text DEFAULT '{}' NOT NULL,
	`policy` text DEFAULT '{"allowedApps":[],"note":"","mode":"advisory"}' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`acknowledged_revision` integer DEFAULT 0 NOT NULL,
	`retention_days` integer DEFAULT 7 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `watcher_guardian_idx` ON `watcher_devices` (`guardian_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `watcher_pair_hash_idx` ON `watcher_devices` (`pair_hash`);--> statement-breakpoint
CREATE TABLE `watcher_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` text NOT NULL,
	`package_name` text NOT NULL,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `watcher_devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `watcher_event_identity` ON `watcher_events` (`device_id`,`package_name`,`timestamp`);--> statement-breakpoint
CREATE INDEX `watcher_event_time` ON `watcher_events` (`device_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `watcher_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`package_name` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	FOREIGN KEY (`device_id`) REFERENCES `watcher_devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `watcher_request_device` ON `watcher_requests` (`device_id`);--> statement-breakpoint
CREATE TABLE `watcher_usage` (
	`device_id` text NOT NULL,
	`day` text NOT NULL,
	`package_name` text NOT NULL,
	`milliseconds` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `watcher_devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `watcher_usage_identity` ON `watcher_usage` (`device_id`,`day`,`package_name`);