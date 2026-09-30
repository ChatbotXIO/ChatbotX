CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactInbox_igSnapshot_pending_idx"
  ON "ContactInbox" ("igSnapshotNextAttemptAt", "id")
  WHERE "igSnapshotState" = 'pending';
