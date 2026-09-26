// The worker image's default command (`worker standalone`): every core queue
// consumer plus the schedule (cron) worker in ONE Node process, so a
// self-hosted install gets broadcast schedules, trial expiry and the purge
// crons from a single container (~500MB, vs ~3.9GB for `worker all`).
//
// Schedule is safe here even with several replicas: its crons are BullMQ job
// schedulers persisted in Redis (`upsertJobScheduler`), not in-process timers.
// It stays out of `core.ts` because `pnpm dev` should not run production-like
// crons against local data.
//
// The sequence-scheduler workers need Kafka, which a default install does not
// run — start them with `worker sequence-*` alongside a broker.
import "./core"
import "./schedule/worker"
