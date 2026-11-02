# Scheduled Jobs and Sequence Scheduling

Handlers that mutate shared state must wrap their body in
`distributedLock.runExclusive({ key, timeoutInSeconds, fn })`. The TTL must be
shorter than the schedule cadence so concurrent worker replicas cannot overlap.

### Adding a schedule handler

Use this four-edit flow, shown by the `purgeWorkspaces` handler:
When changing `purgeWorkspaces`, also read `workspace-purge` so the schedule remains bounded below its lock TTL.


1. Add the `ScheduleJobData` key, payload type, and union member in
   `packages/worker-config/src/queues/schedule/index.ts`.
2. Add `handlers/purge-workspaces.ts` (or the new handler name).
3. Add the corresponding `case` in `src/schedule/worker.ts`.
4. Register it with `upsertJobScheduler` in `handlers/register-schedules.ts`.

## Sequence scheduling

Sequence dispatch uses BullMQ on Redis. `packages/sequence-scheduler` hashes
dispatches across 256 buckets, while `SchedulerClient` stores schedule and retry
entries in Redis sorted sets. Redlock-backed `withLock` claims each dispatch before
it is published to the `sequenceScheduler` queue, preventing concurrent scheduler
workers from processing the same dispatch.
