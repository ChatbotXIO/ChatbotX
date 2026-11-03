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
