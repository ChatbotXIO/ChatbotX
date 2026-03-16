import { initializeDragonfly } from "@aha.chat/scheduler"
import { getBootstrapJob } from "./bootstrap-job"
import { getDispatchConsumer } from "./dispatch-consumer"
import { getSchedulerWorker } from "./scheduler-worker"

export async function startSequenceScheduler() {
  console.log("Starting sequence scheduler...")

  try {
    await initializeDragonfly()

    const scheduler = getSchedulerWorker()
    await scheduler.start()
    console.log("Scheduler worker started")

    const consumer = getDispatchConsumer()
    await consumer.start()
    console.log("Dispatch consumer started")

    const bootstrap = getBootstrapJob()
    await bootstrap.start()
    console.log("Bootstrap job started")

    console.log("Sequence scheduler fully operational")
  } catch (error) {
    console.error("Error starting sequence scheduler:", error)
    throw error
  }
}

export async function stopSequenceScheduler() {
  console.log("Stopping sequence scheduler...")
  try {
    const scheduler = getSchedulerWorker()
    await scheduler.stop()
    console.log("Scheduler worker stopped")

    const consumer = getDispatchConsumer()
    await consumer.stop()
    console.log("Dispatch consumer stopped")

    const bootstrap = getBootstrapJob()
    await bootstrap.stop()
    console.log("Bootstrap job stopped")

    console.log("Sequence scheduler stopped")
  } catch (error) {
    console.error("Error stopping sequence scheduler:", error)
    throw error
  }
}

startSequenceScheduler().catch((error) => {
  console.error("Error starting sequence scheduler:", error)
})

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down sequence scheduler...")
  await stopSequenceScheduler()
  process.exit(0)
})

process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down sequence scheduler...")
  await stopSequenceScheduler()
  process.exit(0)
})
