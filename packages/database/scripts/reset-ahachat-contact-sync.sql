-- One-off reset for a database that already applied the earlier (unreleased) AhaChat
-- contact-sync migrations `20261116070541_add_contact_sync` and
-- `20261118043118_ahachat_import_run_type`. Both folders were replaced by
-- `20261118141854_contact_sync_by_page`. Run it ONLY on a throwaway/dev database,
-- inside the owner's go-ahead, then run `db:migrate`.
--
-- The `ahachat` value of "integrationType" and the `ahachat_import` value of
-- "coexistRunType" stay in their enums (PostgreSQL cannot drop an enum value);
-- the application no longer uses them.
BEGIN;
DROP TABLE IF EXISTS "ContactSyncMapping", "ContactSyncRunItem", "ContactSyncRun", "IntegrationAhachat";
DROP INDEX IF EXISTS "CoexistSyncRun_ahachat_import_active_uq";
DELETE FROM "CoexistSyncRun" WHERE type::text = 'ahachat_import';
DELETE FROM "Integration" WHERE "integrationType"::text = 'ahachat';
DROP TYPE IF EXISTS "contactSyncMappingKind", "contactSyncMappingOrigin", "contactSyncProvider",
  "contactSyncRunItemStatus", "contactSyncRunStatus", "contactSyncTriggerSource", "ahachatChannel";
DELETE FROM drizzle.__drizzle_migrations
  WHERE name IN ('20261118043118_ahachat_import_run_type', '20261116070541_add_contact_sync');
COMMIT;
