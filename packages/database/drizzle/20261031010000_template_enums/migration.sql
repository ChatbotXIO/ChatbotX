-- Template enum values and the new template enum types. Forward-only: PostgreSQL
-- cannot drop an enum value. Kept apart so the values are committed before use.
-- Template resource categories + the uninstalled installation status.
-- NOTE: PostgreSQL cannot remove an enum value, so this migration is not reversible by a rollback; a rolled-back app version simply ignores the extra values. Deploy readers and workers before writers.
ALTER TYPE "templateResourceCategory" ADD VALUE 'sequences' BEFORE 'customFields';
--> statement-breakpoint
ALTER TYPE "templateResourceCategory" ADD VALUE 'aiMcpServers' BEFORE 'customFields';
--> statement-breakpoint
ALTER TYPE "templateResourceCategory" ADD VALUE 'aiFiles' BEFORE 'customFields';
--> statement-breakpoint
ALTER TYPE "templateResourceCategory" ADD VALUE 'questionnaires' BEFORE 'customFields';
--> statement-breakpoint
ALTER TYPE "templateResourceCategory" ADD VALUE 'couponTopics' BEFORE 'customFields';
--> statement-breakpoint
ALTER TYPE "templateResourceCategory" ADD VALUE 'pipelines' BEFORE 'customFields';
--> statement-breakpoint
ALTER TYPE "templateInstallationStatus" ADD VALUE 'uninstalled';
--> statement-breakpoint
-- Install-sync outbox (also the sync history) and the pre-overwrite backups.
CREATE TYPE "templateSyncStatus" AS ENUM('pending', 'running', 'completed', 'partial', 'failed', 'skipped', 'cancelled');
--> statement-breakpoint
CREATE TYPE "templateSyncTrigger" AS ENUM('autoUpdate', 'manual', 'reinstall');
--> statement-breakpoint
CREATE TYPE "templateUninstallState" AS ENUM('none', 'pending', 'running', 'done', 'partial', 'failed', 'skipped');
--> statement-breakpoint
CREATE TYPE "templateUninstallOperationState" AS ENUM('none', 'pending', 'running', 'done', 'partial', 'failed', 'skipped');
