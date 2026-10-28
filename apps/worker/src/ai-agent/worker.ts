import { runWithWebhookExecutionContext } from "@chatbotx.io/events/context"
import {
  AIJobAction,
  type AIJobData,
  type AIJobProcessAutomatedResponse,
  type AIJobProcessHandoffReentry,
  aiJobDataSchema,
  getHeavyJobOptions,
  HeavyJobAction,
  heavyQueue,
  queueNames,
} from "@chatbotx.io/worker-config"
import type { Job } from "bullmq"
import { normalizeError } from "universal-error-normalizer"
import { z } from "zod"
import { env } from "../env"
import { processHandoffReentry } from "../integration/handlers/ai-agent-actions/handoff-reentry"
import { processAutomatedResponse } from "../integration/handlers/automated-response"
import { processCommentAIReply } from "../integration/handlers/comment-automation/ai-reply"
import {
  processStoryMentionAutomation,
  processStoryReplyAutomation,
} from "../integration/handlers/story-reply-automation"
import { runWithOrphanedIntegrationCleanup } from "../integration/job-context"
import { createQueueWorker } from "../lib/create-queue-worker"
import { isBlockedWorkspace } from "../lib/is-blocked-workspace"
import { isFinalAttempt } from "../lib/job-attempts"
import { logger } from "../lib/logger"
import { resolveWorkspaceId } from "../lib/resolve-workspace-id"
import { runJobWithAuditContext } from "../lib/run-job-with-audit-context"
import { runWorker } from "../lib/shutdown"
import { processConversationSource } from "./handlers/process-conversation-source"
import { processConversationSourceEmbedding } from "./handlers/process-conversation-source-embedding"
import { processPendingEmbedding } from "./handlers/process-pending-embeddings"
import { handleSummarizeConversation } from "./handlers/summarize-conversation"
import { markEmbeddingChunkFailed } from "./lib/mark-embedding-chunk-failed"

async function processAutomatedResponseWithWebhookContext(
  data: AIJobProcessAutomatedResponse["data"],
): Promise<void> {
  await runWithWebhookExecutionContext({ source: "webhook" }, () =>
    runWithOrphanedIntegrationCleanup(() => processAutomatedResponse(data)),
  )
}

async function processHandoffReentryWithWebhookContext(
  data: AIJobProcessHandoffReentry["data"],
): Promise<void> {
  await runWithWebhookExecutionContext({ source: "webhook" }, () =>
    runWithOrphanedIntegrationCleanup(() => processHandoffReentry(data)),
  )
}

const jobTypeSchema = z.object({ type: z.string() })

function getRawJobType(data: unknown): string | undefined {
  return jobTypeSchema.safeParse(data).data?.type
}

function startAIAgentWorker() {
  createQueueWorker(
    queueNames.enum.aiAgent,
    async (job: Job<AIJobData>) => {
      logger.debug(
        { jobId: job.id, type: getRawJobType(job.data) },
        "Worker received job",
      )

      const jobData = aiJobDataSchema.parse(job.data)
      const workspaceId = await resolveWorkspaceId(jobData.data)
      if (await isBlockedWorkspace(workspaceId)) {
        return
      }

      await runJobWithAuditContext(
        { workspaceId, source: `ai-agent:${jobData.type}` },
        async () => {
          switch (jobData.type) {
            case AIJobAction.processAIFile:
              await heavyQueue.add(
                HeavyJobAction.processAIFile,
                {
                  type: HeavyJobAction.processAIFile,
                  data: jobData.data,
                },
                {
                  ...getHeavyJobOptions(HeavyJobAction.processAIFile),
                  jobId: `heavy-ai-file-${jobData.data.aiFileId}`,
                },
              )
              return
            case AIJobAction.processPendingEmbedding:
              await processPendingEmbedding(jobData.data)
              return
            case AIJobAction.summarizeConversation:
              await handleSummarizeConversation(jobData.data)
              return
            case AIJobAction.processConversationSource:
              await processConversationSource(jobData.data)
              return
            case AIJobAction.processConversationSourceEmbedding:
              await processConversationSourceEmbedding(jobData.data)
              return
            case AIJobAction.processAutomatedResponse:
              await processAutomatedResponseWithWebhookContext(jobData.data)
              return
            case AIJobAction.processHandoffReentry:
              await processHandoffReentryWithWebhookContext(jobData.data)
              return
            case AIJobAction.commentAIReply:
              await runWithOrphanedIntegrationCleanup(() =>
                processCommentAIReply(jobData.data, !isFinalAttempt(job)),
              )
              return
            case AIJobAction.processStoryReplyAutomation:
              await processStoryReplyAutomation(jobData.data)
              return
            case AIJobAction.processStoryMentionAutomation:
              await processStoryMentionAutomation(jobData.data)
              return
            default: {
              const _exhaustive: never = jobData
              logger.warn(
                { data: _exhaustive, jobName: job.name },
                "Unhandled AI Agent job type",
              )
              return
            }
          }
        },
      )
    },
    {
      concurrency: env.AI_AGENT_WORKER_CONCURRENCY,
      onFailed: async (job, err) => {
        if (!job) {
          logger.error(
            { err: normalizeError(err) },
            "AI Agent job failed without job context",
          )
          return
        }

        const parsedJobData = aiJobDataSchema.safeParse(job.data)
        if (!parsedJobData.success) {
          logger.error(
            {
              err: normalizeError(err),
              jobId: job.id,
              jobName: job.name,
              jobType: getRawJobType(job.data),
              validationError: normalizeError(parsedJobData.error),
            },
            "AI Agent job failed validation",
          )
          return
        }

        let workspaceId: string | undefined
        let workspaceResolutionError:
          | ReturnType<typeof normalizeError>
          | undefined
        try {
          workspaceId = await resolveWorkspaceId(parsedJobData.data.data)
        } catch (resolutionError) {
          workspaceResolutionError = normalizeError(resolutionError)
        }

        const conversationId =
          "conversationId" in parsedJobData.data.data
            ? parsedJobData.data.data.conversationId
            : undefined

        logger.error(
          {
            err: normalizeError(err),
            conversationId,
            jobId: job.id,
            jobType: parsedJobData.data.type,
            workspaceId,
            workspaceResolutionError,
          },
          "AI Agent job failed",
        )

        await markEmbeddingChunkFailed({
          job,
          jobData: parsedJobData.data,
          workspaceId,
        })
      },
    },
  )
}

runWorker("ai-agent", startAIAgentWorker)
