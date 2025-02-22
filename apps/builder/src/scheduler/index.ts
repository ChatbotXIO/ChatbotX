import { JOB_NAMES } from "@/scheduler/types"
import { flowQueue } from "@/workers/flow.worker"
import { Cron } from "croner"

const job = new Cron("*/5 * * * * *", () => {
  console.log("This will run every fifth second")
})

new Cron("0 * * * * *", () => {
  // flowQueue.add(JOB_NAMES.ScheduleBroadcast, {})
})
