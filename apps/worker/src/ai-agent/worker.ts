import {
  AIJobAction,
  type AIJobData,
  defaultWorkerOptions,
  getRedisConnection,
  queueNames,
} from "@chatbotx.io/worker-config"
import { type Job, Worker } from "bullmq"
import { ensureBootstrapped } from "../lib/bootstrap"
import { isBlockedWorkspace } from "../lib/is-blocked-workspace"
import { logger } from "../lib/logger"
import { resolveWorkspaceId } from "../lib/resolve-workspace-id"
import { processAIFile } from "./handlers/process-ai-file"
import { processConversationSource } from "./handlers/process-conversation-source"
import { processConversationSourceEmbedding } from "./handlers/process-conversation-source-embedding"
import { processPendingEmbedding } from "./handlers/process-pending-embeddings"
import { handleSummarizeConversation } from "./handlers/summarize-conversation"

async function startAIAgentWorker() {
  try {
    await ensureBootstrapped()
    logger.info("AI Agent worker bootstrapped successfully")
  } catch (err) {
    logger.error(err, "Failed to bootstrap AI Agent worker")
    process.exit(1)
  }

  const worker = new Worker(
    queueNames.enum.aiAgent,
    async (job: Job<AIJobData>) => {
      logger.info(job.data, `Worker received job: ${job.id}`)

      if (await isBlockedWorkspace(await resolveWorkspaceId(job.data.data))) {
        return
      }

      switch (job.data.type) {
        case AIJobAction.processAIFile:
          await processAIFile(job.data.data)
          return
        case AIJobAction.processPendingEmbedding:
          await processPendingEmbedding(job.data.data)
          return
        case AIJobAction.summarizeConversation:
          await handleSummarizeConversation(job.data.data)
          return
        case AIJobAction.processConversationSource:
          await processConversationSource(job.data.data)
          return
        case AIJobAction.processConversationSourceEmbedding:
          await processConversationSourceEmbedding(job.data.data)
          return
        default:
          logger.warn(`Unknown job name: ${job.name}`)
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
      logger.error(err, `Job ${job.id} has failed`)
    }
  })

  let isShuttingDown = false
  async function shutdown() {
    if (isShuttingDown) {
      return
    }
    isShuttingDown = true
    try {
      await worker.close()
      process.exit(0)
    } catch (err) {
      logger.error(err, "[AIAgentWorker] Error during shutdown")
      process.exit(1)
    }
  }
  process.once("SIGINT", shutdown)
  process.once("SIGTERM", shutdown)
}

startAIAgentWorker()
