import type { Job } from "bullmq"
import { Counter, Histogram, Registry } from "prom-client"

export const registry = new Registry()

export const failedJobsTotal = new Counter({
  name: "failed_jobs_total",
  help: "Total number of failed BullMQ jobs",
  labelNames: ["queue"],
  registers: [registry],
})

export const jobDurationSeconds = new Histogram({
  name: "job_duration_seconds",
  help: "Duration of completed BullMQ jobs in seconds",
  labelNames: ["queue"],
  registers: [registry],
})

export const observeJobDuration = (queue: string, job: Job): void => {
  const { finishedOn, processedOn } = job
  if (finishedOn === undefined || processedOn === undefined) {
    return
  }

  jobDurationSeconds.observe({ queue }, (finishedOn - processedOn) / 1000)
}
