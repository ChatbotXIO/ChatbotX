# Contact activity store and activity-backed contact filters

Channel-agnostic record of what a contact did, used by ten contact filters:
Last Delivered, Completed WhatsApp Flows, Sent message, Keywords Received,
Executed Flow, Executed Step, and Email Sent / Delivered / Opened / Clicked.
Skill: `.agents/skills/contact-filter/`.

## Semantics

- **Since tracking began.** There is no backfill. Negative and "has no value"
  operators mean "no activity since `CONTACT_ACTIVITY_TRACKING_STARTED_AT`".
  Discovery (`contacts.listFilterFields`) reports it per field and the UI shows a hint.
- Set fields: `in` = any of the values; `notIn` = none of them (contacts with no
  history match); `isEmpty` = no activity of that type at all.
- Executed Step is a flow **node** scoped as `flowId:nodeId` (node ids are reused
  when a flow is duplicated).
- Sent message stores only inbound text that matched a keyword rule, normalized
  (accent/case-insensitive) with `normalizeForMatch`.
- Email "No Topic" is the fixed public value `noTopic` (stored as `NO_REFERENCE_ID`).
- Last Delivered: providers with delivery receipts (SDK capability
  `deliveryReceipts`) record from `message:delivered`; others record on a
  successful send.

## Storage

Three tables, no foreign keys, `HASH("workspaceId")` x 64 partitions
(`ContactActivity`, `ContactKeywordMessage`, `ContactState`). Every query carries a
parameterized `"workspaceId" =` so the planner prunes to one leaf. Writers insert
with `INSERT ... SELECT` from `Contact ... FOR KEY SHARE` (ordered by id) under
`workspaceRepository.lockWorkspaceForChildWrite`, so nothing is written after a
contact delete or workspace purge. A `CHECK` constraint pins the allowed
(type, reference, parent) pairs; `CONTACT_ACTIVITY_FILTERS`
(`packages/database/src/partials/contact-activity.ts`) is the single registry that
drives storage, writers, filter SQL and discovery. A new activity = one enum value
plus one registry row (and a migration for the `CHECK`).

Writes are idempotent by primary key (`LEAST` for `firstOccurredAt`, monotonic
`GREATEST` for `lastDeliveredAt`, `ON CONFLICT DO NOTHING` for keyword messages).
Producers write before the irreversible side effect and throw so the job retries;
post-SMTP tracking failures go to the `recordEmailTrackingTransition` repair job,
which never re-sends.

## Kill switches

- `CONTACT_ACTIVITY_WRITES_ENABLED` (default `true`): writers return immediately.
- `CONTACT_ACTIVITY_FILTERS_ENABLED` (default `true`): discovery and the UI hide the
  ten fields; saved conditions still validate and fail closed (`FALSE`), so an
  audience never widens.

## Counting and broadcast audiences

- `countMode: "exact" | "bounded"` on `contacts.count`, `broadcasts.previewAudience`
  and the private count routes. `exact` (default) runs under a 30s statement
  timeout and answers 503 `countTimeout`; `bounded` stops at `BOUNDED_COUNT_CAP`
  (100,000, never request-controlled) and returns `totalCountCapped`/`countCap`.
- A broadcast audience with a contact filter is scanned once in 5,000-row
  `ContactInbox` pages (`forEachFilteredAudienceChunk`), instead of re-running the
  filter per chunk.

## Operations

- **Apply the migration only with explicit approval.** The
  `AnalyticsEmailTopic.topicId` foreign key is re-added `NOT VALID` to avoid a table
  scan inside the migration transaction. After deploy, run
  `ALTER TABLE "AnalyticsEmailTopic" VALIDATE CONSTRAINT "AnalyticsEmailTopic_topicId_EmailTopic_id_fkey";`
  off-peak, then `packages/database/scripts/backfill-email-topic-reference.mjs`
  (batched, idempotent) to fill `topicReferenceId` for existing rows.
- Deploy order: migrate, deploy writers (worker + builder), then readers.
- Release checklist: set `CONTACT_ACTIVITY_TRACKING_STARTED_AT`
  (`packages/database/src/partials/contact-activity.ts`) to the moment the writers
  go live. Discovery and the filter hint report it as the start of history, so a
  stale date makes "Is Not" / "Has no value" claim coverage that never existed.
- Last Delivered is best-effort. A failed receipt batch is logged at error level
  and not redelivered (the message bus acks whole batches); the value only moves
  forward, so the contact's next delivery corrects it.
- Footprint: 3 tables x 64 leaves = 192 leaves, 448 leaf indexes. Watch GIN
  pending-list size on `ContactKeywordMessage_text_trgm_idx`, `ContactState` bloat
  (leaves use fillfactor 80) and workspace purge duration.
- Contact merge does not exist yet; when added it must union activity, move
  keyword messages, take `GREATEST` of state and delete the source in the merge
  transaction.
- Deleted flows, keywords, nodes and topics keep their activity; pickers omit them
  and saved conditions render a "Deleted ... (#id)" label.

## Measured performance

`packages/database/scripts/contact-activity-perf.mjs` (manual, disposable DB only).
One run on a developer laptop, Docker Postgres 18 with default settings, one
workspace of 1,000,000 contacts with 5,000,000 `ContactActivity` rows plus 63
filler workspaces, warm cache:

| Query shape | Time |
|---|---|
| `EXISTS` of one flow over all contacts (100,000 match) | 364 ms |
| `NOT EXISTS` of one flow over all contacts (900,000 match) | 227 ms |
| Capped count (`LIMIT 100001`) of the `EXISTS` | 183 ms |
| Audience-scan page: 5,000 contact ids probed | 22 ms |

The plan prunes to a single leaf partition. Cost is linear in contacts, so a
10M-contact workspace extrapolates to a few seconds for an unbounded whole-workspace
count (hence `countMode: "bounded"` and the 30s exact timeout) and about 45 s for a
full filtered audience scan (2,000 pages). These are a laptop extrapolation, not a
10M staging run; run one before quoting 10M numbers.
