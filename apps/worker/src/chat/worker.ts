import {
  QueueName,
  connection,
  defaultWorkerOptions,
} from "@ahachat.ai/worker-config"
import { Worker } from "bullmq"
import { logger } from "../lib/log"
import {
  addMessageHandler,
  type AddMessageHandlerProps,
} from "./handlers/add-message"
import { prisma } from "@ahachat.ai/database"

const worker = new Worker(
  QueueName.CHAT,
  async (job) => {
    if (job.name === "add") {
      console.log("hhhhh", job.data)
      // await addMessageHandler(job.data as AddMessageHandlerProps)
      // const dbIntegrationWhatsapp =
      //   await prisma.integrationWhatsapp.findFirstOrThrow({
      //     where: {
      //       auth: {
      //         path: ["metadata", "phoneNumber", "id"],
      //         equals: data.phoneID,
      //       },
      //     },
      //   })
    }
  },
  {
    connection,
    ...defaultWorkerOptions,
  },
)

worker.on("failed", (job, err) => {
  if (job) {
    logger.error(`${job.id} has failed`, err)
  }
})
