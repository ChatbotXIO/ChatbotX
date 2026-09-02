# Migration snapshots — provenance note

Snapshot format: drizzle-kit v8 (`snapshot.json` per migration folder, DAG-linked
via `prevIds`). The runtime migrator (`scripts/run-migrations.mjs` →
`readMigrationFiles`) reads ONLY `migration.sql`; snapshots exist solely for
`drizzle-kit generate` diffing.

Two snapshots were SYNTHESIZED by hand on 2026-09-02 (they were not produced by
a `drizzle-kit generate` run at their point in history):

- `20260831040225_add_broadcast_draft_failed_status/snapshot.json` is a
  three-parent MERGE node. The snapshot DAG had diverged into three heads
  (`20260816085646_audit_log_where_and_index`, `20260826144212_add_messaging_ads_tables`,
  `20260826152000_error_log_indexes`), which made `drizzle-kit generate` fail
  with "Non-commutative migrations detected". Its `ddl` is drizzle-kit's own
  rendering of the current `src/schema/index.ts` minus exactly the four
  entities added by the following migration.
- `20260902054310_add_broadcast_soft_delete_and_resume/snapshot.json` carries
  the full current-schema `ddl` and is the DAG's single head.

Verified at synthesis time: `drizzle-kit generate` → "No schema changes" and
`drizzle-kit check` → clean. Branches that do not carry these two files will
still hit the three-head error until they rebase/merge onto them.
