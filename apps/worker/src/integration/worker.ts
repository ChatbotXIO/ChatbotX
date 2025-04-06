import {
  QueueName,
  connection,
  defaultWorkerOptions,
} from "@ahachat.ai/worker-config"
import { Worker } from "bullmq"
import { logger } from "../lib/log"
import { receiveMessage } from "./handlers/received-message"
import { triggerAutomatedResponse } from "./handlers/automated-response"
import { triggerMessage } from "./handlers/trigger-message"
import { IntegrationAction } from "./types"
import { triggerFlowNode } from "./handlers/trigger-flow-node"

const worker = new Worker(
  QueueName.INTEGRATION,
  async (job) => {
    switch (job.name) {
      case IntegrationAction.RECEIVE_MESSAGE: {
        const { message } = await receiveMessage(job.data)

        if (message.content) {
          await triggerAutomatedResponse({
            chatbotId: message.chatbotId,
            messageContent: message.content,
          })
        }
        return
      }
      case IntegrationAction.SEND_FLOW_NODE: {
        await triggerFlowNode({
          flowId: job.data.flowId,
          conversation: job.data.conversation,
        })
        return
      }
      case IntegrationAction.SEND_MESSAGE: {
        await triggerMessage({
          messageContent: job.data.messageContent,
          buttons: [],
          conversation: job.data.conversation,
        })
        return
      }
      default:
        console.log("Unhandled job:", job)
        return
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
