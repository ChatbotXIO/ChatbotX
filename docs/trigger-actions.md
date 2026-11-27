# Trigger sequence actions and loop protection

This document covers the `addSequence` / `removeSequence` trigger actions and the two
layers that keep trigger-driven automation from looping. It is the reference for anyone
adding a trigger action that changes state other triggers listen to.

## Sequence actions

| Action | Stored shape | Runtime |
|---|---|---|
| `addSequence` | `{ type, sequenceIds: string[] }` | [`contactSequenceService.subscribeContactForTrigger`](../packages/business/src/contact-sequence/service.ts) |
| `removeSequence` | `{ type, sequenceIds: string[] }` | [`contactSequenceService.unsubscribeContactForTrigger`](../packages/business/src/contact-sequence/service.ts) |

- `sequenceIds` holds 1 to `MAX_SEQUENCES_PER_TRIGGER_ACTION` (50) ids; the public API
  (`triggers.update`, ids from `sequences.list`) and the builder share that schema. For
  `addSequence` each id costs one enrollment transaction at run time, hence the cap.
- Handlers: [`sequence-actions.ts`](../apps/worker/src/trigger/services/actions/sequence-actions.ts).
  An invalid stored payload is skipped (`invalidAction`) by both. `addSequence` is also
  skipped (`sequenceNotFound`) when none of its sequences exist any more, while the others in
  the list still run; `removeSequence` with missing ids succeeds as a no-op. Both actions are
  idempotent, so a replayed run changes nothing.
- A trigger save rejects a new action that names a missing or foreign sequence
  (`actions.<index>.sequenceIds.<position>`), see `automation-action/references.ts`.
- Inbound webhooks do not offer these actions (`inboundWebhookActionTypes` leaves them out).
- Sequences are not a template resource yet: installing a template keeps the source
  workspace's sequence ids in these actions and reports one warning per id; `addSequence` then
  skips with `sequenceNotFound` and `removeSequence` does nothing.

### No sequence events from trigger actions

Like the trigger tag actions, these never emit `subscribedToSequence` /
`unsubscribedFromSequence` (`emitUnsubscribedEvents: false` on the shared removal path).
A trigger "subscribed to A, add B" plus "subscribed to B, add A" therefore cannot chain.
The cost: sequence changes made by a trigger fire no sequence triggers **and no sequence
outbound webhooks**. Flow steps keep emitting both events; the contacts UI/API emits only
`unsubscribedFromSequence`.

## Loop protection

1. **Direct loops** are prevented by construction: trigger actions use non-emitting service
   methods (`...ForTrigger`), and `TriggerExecutorService` also suppresses trigger events
   emitted inside its own async context.
2. **Circuit breaker** for every other path (trigger, flow, sequence or webhook cycles that go
   through a queue, where the in-process suppression does not reach):
   `triggerService.tryAcquireContactRun` lets a trigger run at most `TRIGGER_CONTACT_RUN_LIMIT`
   (20) times per contact per `TRIGGER_CONTACT_RUN_WINDOW_SECONDS` (60). The window is fixed and
   starts at the first run, so up to about twice the limit can pass across a window boundary. A
   run over the limit is skipped before any action or bookkeeping; the first skipped run of a
   window is logged at `warn` ("per-contact run limit exceeded"), the rest silently.

   **Counter.** `distributedStore.incrWithWindow` on the cache role (`REDIS_CACHE_URL`, falling
   back to `REDIS_URL`), key `trigger:contact-run:{triggerId}:{contactId}`: one Lua call that
   increments and sets the TTL on the first hit, so a key lives at most one window.

   **Memory.** A key costs about 130 bytes. Unexpired keys are at most the distinct (trigger,
   contact) pairs *attempted* in the last 60 seconds, so memory follows trigger throughput, not
   the size of the contact base. One event can match up to 50 triggers and each match is one
   attempt:

   | Attempts per second | Live keys (60 s) | Counter dataset |
   |---|---|---|
   | 1,000 | 60,000 | ~8 MB |
   | 10,000 | 600,000 | ~79 MB |
   | 50,000 | 3,000,000 | ~394 MB |

   Plan about 1.5x of the dataset for fragmentation and table growth, and the same on every
   replica. Each new key is also a replicated and persisted write, and each expiry a delete,
   so watch command latency, expiry CPU, memory headroom, replication lag and evictions.

   **Where it lives.** Without `REDIS_CACHE_URL` the counters use `REDIS_URL`. When that is the
   same instance as the BullMQ queues (`REDIS_QUEUE_URL` / `REDIS_QUEUE_BULK_URL` default to it),
   which run `noeviction`, a full instance fails queue writes too and failing open cannot help.
   For large tenants give the cache role its own instance with `maxmemory` and `allkeys-lru`; an
   evicted counter only restarts its count, which delays a trip. See `docs/scaling-messaging.md`.

   **Failure handling.** The call fails open, so a Redis problem does not stop trigger runs. It is
   bounded by `TRIGGER_CONTACT_RUN_LIMITER_TIMEOUT_MS` (1 s; the cache connection's own command
   timeout is 10 s), and a failure opens a `FailOpenCircuit` for
   `TRIGGER_CONTACT_RUN_LIMITER_BACKOFF_MS` (5 s, per worker process): runs then skip the limiter,
   one probe call is let through when the backoff ends, and the circuit closes when it succeeds.
   One error line is logged when an outage starts and one info line on recovery. While the
   circuit is open the breaker is off for every trigger in that process, so unrelated loops are
   not caught either.

Known blind spots of the circuit breaker:

- A loop slower than about one cycle per 3 seconds (wait steps, sequence step delays, slow
  external calls) never trips it; it only bounds tight loops.
- A loop through two triggers counts each trigger separately, so it can run about twice the
  limit before it stops.
- A legitimate burst above 20 runs of one trigger for one contact within a minute (for example
  bulk updates of the same custom field) is dropped, visible only as the `warn` log.

Datetime-trigger runs are one-shot per occurrence and do not use the breaker.

## Post-comment events

Two trigger events fire when a contact comments on a post. They need no migration: the
signal comes from the comment ingestion path and the existing `ContactInboxPost` row.

| Event type | Fires when |
|---|---|
| `contactCommentedOnPost` | for **every** comment a contact leaves on a post, replies to other comments included |
| `contactFirstCommentedOnPost` | only for the **first** comment of that contact on that post (a second comment fires only `contactCommentedOnPost`) |

Both are listed under **Posts** in the Triggers condition menu (not in the Webhooks menu; the
shared event list lets the webhook API accept them, and their payload is `contact_commented_on_post` /
`contact_first_commented_on_post`).

**Channels.** Messenger (Facebook Pages) and Instagram only. Those are the channels that track a
comment's post in `ContactInboxPost` (`supportsPostTracking`). Threads and TikTok comments, a
comment on a post the page has no stored row for, and replayed missed comments fire nothing.

### Conditions

A condition is the event plus three optional narrowings, all `AND`ed:

| Field | Meaning |
|---|---|
| `sourceId` | one inbox (page or account); null = any |
| `value.scope` | `any` (default), `selected` or `publishedFromPosts` |
| `value.channelPostIds` | for `selected`: the stored posts (`channelPosts.list` ids, 1 to 50) |

Saving a trigger (`triggerService.updateWithConditions`, so the session action and `PUT /v1/triggers/{id}` alike) checks the
posts of a condition with one workspace-scoped read: every id must exist in the workspace and,
when `sourceId` is set, belong to that inbox, else 422 at `conditions.<i>.value.channelPostIds`
(`validation.trigger.postCommentPostsInvalid`), because the evaluator requires both and such a
condition could never fire. A condition that keeps the (inbox, posts) pair it already stores is
not checked again, so a trigger naming a deleted post can still be saved. Template installs do
not go through this path (they drop the pinned inbox and posts).

`publishedFromPosts` matches only a post a target of Posts published (a `SocialPostTarget`
whose `channelPostId` is that post, joined inside the workspace); the permalink is never used
to guess it. A stored `value` the evaluator cannot read narrows to nothing, it never widens to
"any post". The cache that decides whether anyone is listening treats both events as
evaluator-filtered (they carry no `sourceId`), so they enqueue whenever any active condition of the
type exists.

### Where the event comes from

`receiveComment` ([`received-message.ts`](../apps/worker/src/integration/handlers/received-message.ts))
stores the comment, then calls
[`emitPostCommentTriggers`](../apps/worker/src/integration/handlers/post-comment-trigger.ts)
once the workspace gate has passed. It uses the outcome of
`contactInboxPostService.recordCommentOutcome`, the `INSERT ... ON CONFLICT DO NOTHING` on the
unique `(workspaceId, contactInboxId, postId)`:

- `inserted`: first comment, atomically (two racing comments cannot both be first);
- `existing`: a repeat, unless it is the redelivery of the very comment that won the insert: the
  winner writes its platform comment id to `post-comment:first:{workspaceId}:{contactInboxId}:{channelPostId}`
  (30 days) right after the insert, before any slow step, and an `existing` comment only **reads**
  it and is first only when the stored id is its own. A missing or evicted key means "not first"
  (a welcome flow is never fired twice; the worst case is a lost first event). The row keeps whole
  seconds, so the timestamp alone cannot tell two same-second comments apart;
- `skipped`: nothing was recorded (workspace being deleted, post of another channel): no event.

**Dedupe.** Each event of each comment is claimed once per emitter in Redis
(`post-comment:emitted:{inboxId}:{commentId}:{commented|firstCommented}:{trigger|webhook}`, 7 days, `SET NX`), so a
webhook redelivery or a job retry emits nothing twice. Nothing is claimed or written to Redis when
the workspace has no active trigger or webhook for the event (checked through the existing
`hasActiveTriggers` / `hasActiveWebhooks` caches), so an unused feature grows no keys. If the
enqueue fails only that emitter's claim is released, so a redelivery re-emits only to the emitter that failed (a trigger job that was queued is not queued twice). An emitter with no active listener for the event is skipped. The queue job id is
deterministic (`post-comment-{eventType}-{commentMessageId}`), so BullMQ also drops a duplicate of
a job still queued if a claim is lost after a Redis failover; limitation: a job already completed
(`removeOnComplete`) is no longer deduped by id. The trigger job id then keys the actions'
own occurrence keys, as for any trigger. An emit failure is logged and never fails the ingestion
job (a retry would only find the comment already stored).

**Loops.** The page's own comments are dropped at the top of `receiveComment`, so a trigger
that replies under the post never comes back as an event. The trigger emitter's worker-context
guard (which silences events emitted by trigger actions) lets these two events through
(`INGRESS_ORIGINATED_EVENT_TYPES`): no action can produce a contact's comment. The per-contact
run breaker above still applies: one contact commenting more than 20 times in a minute on posts
a trigger listens to is cut off.

### Run-scoped variables

A run of either event carries the comment it fired for. These render in the trigger's actions
that take variables (pipeline action, Meta CAPI) and in a flow the trigger starts
(`startAnotherFlow`, `startExternalStep`), and **nowhere else**:

| Variable | Value |
|---|---|
| `{{post.link}}` | the post's permalink |
| `{{post.text}}` | the post's caption |
| `{{post.published_at}}` | when it was published, in the contact's timezone |
| `{{post.page_name}}` | the connected page or account's name |
| `{{post.id}}` | the platform's post id |
| `{{comment.text}}` | the comment's text |
| `{{comment.id}}` | the platform's comment id |

They are resolved by [`post-comment-variable.ts`](../packages/variables/src/post-comment-variable.ts),
as a lazy loader on the variables context (like `{{pipelines.*}}`), not a contact field: a token
outside such a run renders empty, never a "latest post" (the `last_*` comment fields are a
different, contact-scoped thing). The trigger executor passes the comment's ids
(`PostCommentRef`: stored post id, comment message id and time) to the actions; a flow started by
the trigger carries them in its run `metadata` (`type: "postComment"`), which survives every
continuation and a Wait, and the message renderer reads the post and the comment back from them.
The message steps, the **Execute JavaScript** step (`{{post.link}}` becomes a plain `input["post.link"]`
value, like any other name) and the **External request** step (URL, headers and body; a JSON body is
JSON-escaped) read the tokens from the same run metadata; they are never read from "the latest post".
The builder offers them in a "Post comment" group of the variable picker (message text, pipeline
action texts, JavaScript code). Limit: a button tapped later starts a new run without them.

A comment does not open the direct-message window: a flow the trigger starts is subject to the
channel's normal sending rules, so reaching a commenter first still needs a comment-anchored
private reply (Comment Automation).

### Templates

Post-comment conditions are copied with their trigger. A condition that names a page (`sourceId`)
or posts (`value.channelPostIds`) names resources of the source workspace that never travel, so on
install it is dropped (never widened to "any"), the trigger stays inactive and one `referenceRemoved`
warning is reported, as for any other dropped condition; the publisher sees it in the dropped count.
A condition with no page and scope `any` or `publishedFromPosts` installs unchanged.
