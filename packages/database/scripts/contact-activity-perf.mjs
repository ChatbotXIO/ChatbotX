/**
 * Manual performance harness for the contact activity store (not part of any
 * test run). Seeds one big workspace (CONTACTS contacts, ~5 activity rows per
 * contact) plus filler workspaces, then times the SQL shapes the filters
 * generate: set `in`, `notIn` (NOT EXISTS), the capped count, and the keyset
 * page probe used by the broadcast audience scan.
 *
 *   DATABASE_URL=postgresql://... CONTACTS=200000 node scripts/contact-activity-perf.mjs
 *
 * Point it at a disposable, migrated database only. It deletes what it seeds.
 * The seeded ids live in a high range to avoid colliding with real rows.
 */
import { performance } from "node:perf_hooks"
import pg from "pg"

const CONTACTS = Number(process.env.CONTACTS ?? 200_000)
const ACTIVITIES_PER_CONTACT = 5
const FILLER_WORKSPACES = 63
const BIG_WORKSPACE = 9_000_000_000_000_001n
const FIRST_FILLER = 9_000_000_000_001_000n
const FIRST_CONTACT = 9_000_000_000_100_000n
const FLOW_IDS = 50

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })

const time = async (label, text, values = []) => {
  const started = performance.now()
  const result = await client.query(text, values)
  const ms = performance.now() - started
  console.log(
    `${label.padEnd(44)} ${ms.toFixed(1).padStart(9)} ms  rows=${result.rows[0]?.n ?? result.rowCount}`,
  )
  return ms
}

const cleanup = async () => {
  await client.query(
    `DELETE FROM "ContactActivity" WHERE "workspaceId" >= $1 AND "workspaceId" < $2`,
    [BIG_WORKSPACE, BIG_WORKSPACE + 10_000n],
  )
}

try {
  await client.connect()
  console.log(
    `seeding ${CONTACTS} contacts x ${ACTIVITIES_PER_CONTACT} activities (+${FILLER_WORKSPACES} filler workspaces)`,
  )
  await cleanup()

  // No FK on ContactActivity, so rows can be seeded without Contact rows;
  // the NOT EXISTS / EXISTS shapes below only read ContactActivity.
  const seeded = performance.now()
  await client.query(
    `INSERT INTO "ContactActivity"
       ("workspaceId","contactId","activityType","referenceType","parentReferenceId","referenceId","firstOccurredAt")
     SELECT $1::bigint, $2::bigint + c, 'flowExecuted', 'flow', 0, 1000 + (c + a) % $3, now()
     FROM generate_series(0, $4::int - 1) c, generate_series(0, $5::int - 1) a
     ON CONFLICT DO NOTHING`,
    [BIG_WORKSPACE, FIRST_CONTACT, FLOW_IDS, CONTACTS, ACTIVITIES_PER_CONTACT],
  )
  for (let w = 0; w < FILLER_WORKSPACES; w += 1) {
    await client.query(
      `INSERT INTO "ContactActivity"
         ("workspaceId","contactId","activityType","referenceType","parentReferenceId","referenceId","firstOccurredAt")
       SELECT $1::bigint, $2::bigint + c, 'flowExecuted', 'flow', 0, 1000 + c % 10, now()
       FROM generate_series(0, 999) c`,
      [FIRST_FILLER + BigInt(w), FIRST_CONTACT],
    )
  }
  await client.query(`ANALYZE "ContactActivity"`)
  console.log(
    `seeded in ${((performance.now() - seeded) / 1000).toFixed(1)} s\n`,
  )

  const base = [BIG_WORKSPACE, FIRST_CONTACT]
  const page = Array.from({ length: 5000 }, (_, i) =>
    String(FIRST_CONTACT + BigInt(i * 7)),
  )

  await time(
    "EXISTS in [1 flow], whole workspace (count)",
    `
    SELECT count(*)::int n FROM generate_series(0, $3::int - 1) c
    WHERE EXISTS (SELECT 1 FROM "ContactActivity" a WHERE a."workspaceId" = $1 AND a."contactId" = $2::bigint + c
      AND a."activityType" = 'flowExecuted' AND a."referenceType" = 'flow' AND a."parentReferenceId" = 0 AND a."referenceId" = 1001)`,
    [...base, CONTACTS],
  )
  await time(
    "NOT EXISTS in [1 flow], whole workspace (count)",
    `
    SELECT count(*)::int n FROM generate_series(0, $3::int - 1) c
    WHERE NOT EXISTS (SELECT 1 FROM "ContactActivity" a WHERE a."workspaceId" = $1 AND a."contactId" = $2::bigint + c
      AND a."activityType" = 'flowExecuted' AND a."referenceType" = 'flow' AND a."parentReferenceId" = 0 AND a."referenceId" = 1001)`,
    [...base, CONTACTS],
  )
  await time(
    "capped count (cap 100000+1) of EXISTS",
    `
    SELECT count(*)::int n FROM (
      SELECT 1 FROM generate_series(0, $3::int - 1) c
      WHERE EXISTS (SELECT 1 FROM "ContactActivity" a WHERE a."workspaceId" = $1 AND a."contactId" = $2::bigint + c
        AND a."activityType" = 'flowExecuted' AND a."referenceType" = 'flow' AND a."parentReferenceId" = 0 AND a."referenceId" = 1001)
      LIMIT 100001) t`,
    [...base, CONTACTS],
  )
  await time(
    "audience scan page: 5000 ids, EXISTS probe",
    `
    SELECT count(*)::int n FROM unnest($2::bigint[]) id
    WHERE EXISTS (SELECT 1 FROM "ContactActivity" a WHERE a."workspaceId" = $1 AND a."contactId" = id
      AND a."activityType" = 'flowExecuted' AND a."referenceType" = 'flow' AND a."parentReferenceId" = 0 AND a."referenceId" = 1001)`,
    [BIG_WORKSPACE, page],
  )
  const plan = await client.query(
    `EXPLAIN SELECT 1 FROM "ContactActivity" WHERE "workspaceId" = $1 AND "contactId" = $2`,
    [BIG_WORKSPACE, FIRST_CONTACT],
  )
  console.log(
    `\npartition pruning plan (expect one leaf):\n${plan.rows.map((r) => r["QUERY PLAN"]).join("\n")}`,
  )
} finally {
  await cleanup().catch(() => undefined)
  await client.end()
}
