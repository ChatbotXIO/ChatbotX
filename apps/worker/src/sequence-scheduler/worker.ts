import { initializeDragonfly } from "@aha.chat/scheduler"
import { getBootstrapJob } from "./bootstrap-job"
import { getDispatchConsumer } from "./dispatch-consumer"
import { getSchedulerWorker } from "./scheduler-worker"

const scheduler = getSchedulerWorker()
const consumer = getDispatchConsumer()
const bootstrap = getBootstrapJob()

const services = [
  {
    name: "Scheduler worker",
    start: () => scheduler.start(),
    stop: () => scheduler.stop(),
  },
  {
    name: "Dispatch consumer",
    start: () => consumer.start(),
    stop: () => consumer.stop(),
  },
  {
    name: "Bootstrap job",
    start: () => bootstrap.start(),
    stop: () => bootstrap.stop(),
  },
] as const

let isShuttingDown = false

export async function startSequenceScheduler() {
  console.log("Starting sequence scheduler...")

  try {
    await initializeDragonfly()
    for (const service of services) {
      await service.start()
      console.log(`${service.name} started`)
    }

    console.log("Sequence scheduler fully operational")
  } catch (error) {
    console.error("Error starting sequence scheduler:", error)
    throw error
  }
}

export async function stopSequenceScheduler() {
  console.log("Stopping sequence scheduler...")

  const stopErrors: unknown[] = []
  for (const service of [...services].reverse()) {
    try {
      await service.stop()
      console.log(`${service.name} stopped`)
    } catch (error) {
      stopErrors.push(error)
      console.error(`Error stopping ${service.name}:`, error)
    }
  }

  if (stopErrors.length > 0) {
    throw new AggregateError(
      stopErrors,
      "One or more sequence scheduler services failed to stop",
    )
  }

  console.log("Sequence scheduler stopped")
}

startSequenceScheduler().catch((error) => {
  console.error("Error starting sequence scheduler:", error)
  process.exitCode = 1
})

const handleShutdownSignal = async (signal: "SIGINT" | "SIGTERM") => {
  if (isShuttingDown) {
    return
  }
  isShuttingDown = true

  console.log(`${signal} received, shutting down sequence scheduler...`)

  try {
    await stopSequenceScheduler()
    process.exit(0)
  } catch (error) {
    console.error("Error during sequence scheduler shutdown:", error)
    process.exit(1)
  }
}

process.on("SIGINT", () => {
  handleShutdownSignal("SIGINT").catch((error) => {
    console.error("Unhandled SIGINT shutdown error:", error)
    process.exit(1)
  })
})

process.on("SIGTERM", () => {
  handleShutdownSignal("SIGTERM").catch((error) => {
    console.error("Unhandled SIGTERM shutdown error:", error)
    process.exit(1)
  })
})
