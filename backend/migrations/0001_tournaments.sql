CREATE TABLE `auctions` (
	`tournament_id` text PRIMARY KEY NOT NULL,
	`teams` text DEFAULT '[]' NOT NULL,
	`state` text DEFAULT '[]' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`phone` text NOT NULL,
	`utr` text NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_player_phone` ON `players` (`tournament_id`,`phone`);--> statement-breakpoint
CREATE UNIQUE INDEX `unique_player_utr` ON `players` (`tournament_id`,`utr`);--> statement-breakpoint
CREATE TABLE `tournaments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`settings` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
