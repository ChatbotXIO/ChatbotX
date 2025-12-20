import { SenderType } from "@aha.chat/database"
import type { OutgoingMessageEntity } from "@aha.chat/sdk"
import {
  defaultWorkerOptions,
  getRedisConnection,
  IntegrationJobAction,
  type IntegrationJobData,
  integrationQueue,
  QueueName,
} from "@aha.chat/worker-config"
import { type Job, Worker } from "bullmq"
import { logger } from "../lib/logger"
import { triggerAutomatedResponse } from "./handlers/automated-response"
import { receiveMessage } from "./handlers/received-message"
import { sendFlowNode } from "./handlers/send-flow-node"
import {
  sendFlowPostback,
  sendFlowQuickReply,
} from "./handlers/send-flow-postback"

const worker = new Worker(
  QueueName.integration,
  async (job: Job<IntegrationJobData>) => {
    switch (job.data.type) {
      case IntegrationJobAction.incomingMessage: {
        const { message, postbackAction } = await receiveMessage(job.data.data)

        // Trigger automated response if the message is from a user
        if (
          !postbackAction &&
          message.content &&
          message.senderType === SenderType.contact
        ) {
          await integrationQueue.add(
            IntegrationJobAction.triggerAutomatedResponse,
            {
              type: IntegrationJobAction.triggerAutomatedResponse,
              data: {
                message: message as OutgoingMessageEntity,
              },
            },
          )
        }
        return
      }
      case IntegrationJobAction.sendFlow: {
        await sendFlowNode(job.data)
        return
      }
      case IntegrationJobAction.sendFlowPostback: {
        await sendFlowPostback(job.data.data)
        return
      }
      case IntegrationJobAction.sendFlowQuickReply: {
        await sendFlowQuickReply(job.data.data)
        return
      }
      case IntegrationJobAction.triggerAutomatedResponse: {
        await triggerAutomatedResponse(job.data.data)
        return
      }
      default:
        return
    }
  },
  {
    connection: getRedisConnection(),
    ...defaultWorkerOptions,
  },
)

worker.on("failed", (job, err) => {
  if (job) {
    logger.error(`${job.id} has failed`, err)
  }
})
