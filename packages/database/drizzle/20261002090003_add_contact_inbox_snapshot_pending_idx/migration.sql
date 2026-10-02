CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactInbox_profileSnapshot_pending_idx"
  ON "ContactInbox" ("profileSnapshotNextAttemptAt", "id")
  WHERE "profileSnapshotState" = 'pending';
