# Leaderboards

Ranking campaigns ("đua top"): contacts earn points for interactions on one
platform and compete on a public, mobile-first leaderboard page. Admins manage
campaigns, participants and scores; the top N can receive a reward flow.

Code map:

| Layer | Where |
|---|---|
| Schema, partials | `packages/database/src/schema/leaderboard*.ts`, `src/partials/leaderboard.ts` |
| Repositories | `packages/database/src/repositories/leaderboard/`, `repositories/leaderboard-partitions.ts` |
| Services | `packages/business/src/leaderboard/` (`@chatbotx.io/business/leaderboard`) |
| Redis ranking | `packages/redis/src/leaderboard-store.ts` |
| Queue + consumer | `packages/worker-config/src/queues/leaderboard`, `apps/worker/src/leaderboard/` (hosted by the `low` worker process) |
| Crons | `apps/worker/src/schedule/handlers/{maintain-leaderboard-partitions,leaderboard-schedules}.ts` |
| Public API | `apps/builder/src/features/leaderboards/api/public.ts` (`leaderboards.*`, scope `leaderboards`) |
| Public page | `apps/builder/src/app/leaderboards/page.tsx`, `app/api/leaderboards/[id]/{board,me}` |
| Flow | step `changeGamificationScore`; condition field `leaderboardScore` |

## Platforms

One platform per campaign; its rules are `LEADERBOARD_RULES_BY_PLATFORM`
(`packages/database/src/partials/leaderboard.ts`). Messenger, Instagram,
WhatsApp, Zalo, Telegram, Email and Gamification follow the product spec.
TikTok and Threads were added beyond it, limited to what those channels
deliver:

- **TikTok**: video comments and DM keywords.
- **Threads**: comments only (Threads has no DMs).
- No referral on either: neither channel can carry a `ref` into a chat, so
  their public page hides the share button.
- No golden-hour bonus or specific-post scope: both need tracked posts
  (`ChannelPost` with a publish time), which only Messenger and Instagram
  store (`LEADERBOARD_POST_TRACKING_PLATFORMS`).

## Lifecycle

`draft → active ⇄ paused → finished`. Allowed actions per status are
`LEADERBOARD_ACTIONS_BY_STATUS` (`packages/business/src/leaderboard/service.ts`):
automatic and flow scoring only while **active**; manual edits while active or
paused. `finishOverdueLeaderboards` (every minute) closes campaigns at
`endsAt`. Transitions are compare-and-set on the current status, so the finish
cron and an admin's pause cannot overwrite each other.

**Late events.** For `LEADERBOARD_LATE_EVENT_GRACE_MS` (10 min) after
finishing, a leaderboard still takes rule events that *happened* before its
end (`endsAt`, or `finishedAt` when finished early) — the end-of-campaign rush
queues behind the leaderboard worker. Automatic rewards wait out that grace.
Sending rewards stamps `rewardsTriggeredAt`, which freezes every score for
good: each score write checks the status under a `FOR SHARE` lock on the
Leaderboard row, and the rewards stamp is an UPDATE of that row.

## Rewards

`triggerLeaderboardRewards` stamps `rewardsTriggeredAt` (kept if set), reads
the final top N from Postgres, and claims each winner in
`Leaderboard.rewardRecipients` (`pending`) **before** queueing its flow, then
records `sent`/`skipped`. A double click, the automatic job racing an admin,
or a retry never sends one winner twice; a run that stopped half-way is
resumed by the next one (the automatic job retries when a flow failed to
queue; admin/API runs queue a background retry). A run that died between the
claim and the queue leaves `pending` — check it by hand rather than re-send.

## Scoring path

1. A source (comment, keyword, minigame win, email open…) calls
   `enqueueLeaderboardAward` with a stable `sourceRef` and the source event's
   own time. It first reads the cached "live leaderboards of this inbox" list,
   so inboxes without a leaderboard cost one cache read and no job.
2. The `leaderboard` queue job runs `leaderboardScoringService.award`, which
   filters (window, post scope, min chars, tags, followers) and applies the
   change in one transaction:
   - `INSERT` the score event with a primary key **derived from the source
     event** (`deterministicLeaderboardEventId` + event time) — a redelivery
     or retry hits `ON CONFLICT DO NOTHING`;
   - `UPSERT` the participant row, enforcing ban, daily cap and cooldown in
     its `WHERE` (daily counters live on the row, bucketed by `resetTime`, so
     there is no reset cron). A rejected upsert rolls the event back.
3. Still inside the transaction (participant row locked) the exact new score
   is written to Redis (`setScore` Lua script); a Redis failure schedules a
   rebuild after the transaction.
4. Flow steps have no source time: their event id comes from the flow
   execution key + step id, and a 7-day look-back (`dedupSince`) catches a
   retried job.

## Postgres vs Redis

Postgres is the source of truth; Redis holds **one sorted-set entry per
participant** (`lb:{id}:rank`) plus a tiny stats hash and a 3-second Top-50
cache. Rank value = `score × 1e8 + (99 999 999 − seconds since start)` —
higher score first, earlier achiever wins ties; exact below 2^53, hence the
`LEADERBOARD_MAX_SCORE` / 3-year duration limits.

- Writes are absolute values sent while the participant row is locked, so
  they reach Redis in commit order and need no per-member version.
- A missing `rank` key means "not built": readers rebuild it from Postgres
  under a lock (keyset pages + `RENAME`), and fall back to Postgres
  (`ORDER BY score DESC, scoredAt`, rank via indexed `COUNT`) meanwhile. The
  keyset cursor carries `scoredAt` as text (microseconds; a JS Date would
  truncate it and loop forever on a page of identical timestamps, e.g. after
  "reset points").
- A write during a rebuild also goes to the rebuild key; after the `RENAME`
  the rebuild re-reads (row-locked) every participant changed since it
  started and writes the exact values, so nothing written meanwhile is lost.
- `maintainLeaderboardRankings` rebuilds each live leaderboard daily at its
  reset hour as a safety net and reports memory.
- Finished leaderboards drop their Redis keys and are served from Postgres.

Measured memory on Redis 8: ~103 bytes/participant (100k players ≈ 10 MB),
~20 bytes for boards under 128 players (listpack). See
`docs/scaling-messaging.md` for the shared-Redis caveat.

## Score history partitions

`LeaderboardScoreEvent` is RANGE-partitioned by month on `createdAt` (DEFAULT
partition as a safety net). `maintainLeaderboardPartitions` (daily) creates
two months ahead and drops months older than 12 months unless a live
leaderboard started in them. Always bound queries by `createdAt`. The table has
no foreign keys; workspace purge drains it by primary key — never `ctid`,
which repeats across partitions. Admin interventions are also written to
`LeaderboardAuditLog`, which is never dropped.

## Referrals

The public page's share button links to the viewer's channel with
`ref=lb_<leaderboardId>_<contactId>`. `runRef` adds the friend to the
leaderboard (stamping `referrerContactId`) and credits the referrer only when
the friend is new to that leaderboard. The ref is unsigned: the credit path
checks workspace ownership, self-referral, bans and the daily cap. A welcome
flow (auto-created on create when referral is on) greets the friend with
`{{referral_name}}` and a button to the page; the page identifies a viewer
only through the signed `{{leaderboard_view_token}}`.

## Webhook trust for scoring sources

Some sources award points from webhooks that were previously unsigned:

- **Telegram groups** (`joinGroup`, `groupDiscussion`): bots connected after
  this change get a random `secret_token` (stored in the integration's
  `auth.metadata.webhookSecretToken`) and every update must carry it in
  `X-Telegram-Bot-Api-Secret-Token`. Bots connected earlier have no token:
  their DMs keep working, but group/membership events are ignored for scoring
  until the bot is **reconnected**.
- **Zalo follow/unfollow** (`follow`): scored only when `X-ZEvent-Signature`
  verifies against the raw body (`sha256(appId + body + timestamp + secret)`).
  Unverifiable follows are acknowledged and dropped. Other Zalo events keep
  their existing (unsigned) handling.
- **Referrals** credit only arrivals on a shareable channel (never webchat)
  and on the leaderboard's own inbox; the referral rule defaults to 10 credits
  per referrer per day.
