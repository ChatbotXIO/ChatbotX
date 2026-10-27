// The worker image's default command (`worker standalone`): every core queue
// consumer, the schedule (cron) worker and the sequence workers in ONE Node
// process, so a self-hosted install gets broadcast schedules, trial expiry,
// the purge crons and sequence delivery from a single container.
//
// Schedule is safe here even with several replicas: its crons are BullMQ job
// schedulers persisted in Redis (`upsertJobScheduler`), not in-process timers.
// The sequence workers run on BullMQ + Redis too (`createProducer`/
// `createConsumer` only support bullmq), and claim buckets under a Redis lock.
// Both stay out of `core.ts` because `pnpm dev` should not run production-like
// crons and sequence sends against local data.
import "./core"
import "./schedule/worker"
import "./sequence-scheduler/worker"
import "./sequence-scheduler/worker-producer"
import "./sequence-scheduler/worker-consumer"
