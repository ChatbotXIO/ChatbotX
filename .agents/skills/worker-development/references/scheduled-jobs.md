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
   A new every-minute cron must be classified, or
   `register-schedules-edition.test.ts` fails: add it to
   `EVERY_MINUTE_SECOND_OFFSETS` on its own free second (use
   `everyMinuteAtOffset`), or keep `"* * * * *"` if it reads the minute boundary
   (`startOfMinute`) or starts user-scheduled sends. Then list it in the test's
   `SPREAD_OVER_THE_MINUTE` or `ON_THE_MINUTE`.

## Sequence scheduling

Sequence dispatch uses BullMQ on Redis. `packages/sequence-scheduler` hashes
dispatches across 256 buckets, while `SchedulerClient` stores schedule and retry
entries in Redis sorted sets. Redlock-backed `withLock` claims each dispatch before
it is published to the `sequenceScheduler` queue, preventing concurrent scheduler
workers from processing the same dispatch. The producer polls each assigned
bucket every `SCHEDULER_TICK_INTERVAL_MS` (default 5000; idle cost is
`buckets x 2 x 1000 / interval` Redis commands per second).
