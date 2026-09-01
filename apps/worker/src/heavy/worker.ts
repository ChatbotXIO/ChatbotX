import {
  defaultWorkerOptions,
  getRedisConnection,
  HeavyJobAction,
  type HeavyJobData,
  heavyJobDataSchema,
  queueNames,
} from "@chatbotx.io/worker-config"
import { type Job, Worker } from "bullmq"
import { normalizeError } from "universal-error-normalizer"
import { env } from "../env"
import { ensureBootstrapped } from "../lib/bootstrap"
import { detectConversationAndContactInbox } from "../lib/db"
import { isBlockedWorkspace } from "../lib/is-blocked-workspace"
import { logger } from "../lib/logger"
import { resolveWorkspaceId } from "../lib/resolve-workspace-id"
import { runJobWithAuditContext } from "../lib/run-job-with-audit-context"
import { analyzeImage } from "./handlers/analyze-image"
import { editImageOutput } from "./handlers/edit-image"
import { extractFallbackTextSnippets } from "./handlers/extract-text-from-file"
import { generateImageOutput } from "./handlers/generate-image"
import { processAIFile } from "./handlers/process-ai-file"
import { speechToTextOutput } from "./handlers/speech-to-text"
import { textToSpeechOutput } from "./handlers/text-to-speech"

type HeavyStepJobData = Extract<
  HeavyJobData,
  {
    type:
      | typeof HeavyJobAction.aiEditImage
      | typeof HeavyJobAction.aiGenerateImage
      | typeof HeavyJobAction.aiSpeechToText
      | typeof HeavyJobAction.aiTextToSpeech
  }
>

async function runHeavyStep(jobData: HeavyStepJobData) {
  const { conversation, contactInbox } =
    await detectConversationAndContactInbox({
      conversationId: jobData.data.conversationId,
      contactInboxId: jobData.data.contactInboxId,
    })

  const props = {
    conversation,
    contactInbox,
    metadata: jobData.data.metadata,
    step: jobData.data.step,
  }

  try {
    switch (jobData.type) {
      case HeavyJobAction.aiEditImage:
        return {
          status: "success" as const,
          outputValue: await editImageOutput({
            ...props,
            step: jobData.data.step,
          }),
        }
      case HeavyJobAction.aiGenerateImage:
        return {
          status: "success" as const,
          outputValue: await generateImageOutput({
            ...props,
            step: jobData.data.step,
          }),
        }
      case HeavyJobAction.aiSpeechToText:
        return {
          status: "success" as const,
          outputValue: await speechToTextOutput({
            ...props,
            step: jobData.data.step,
          }),
        }
      case HeavyJobAction.aiTextToSpeech:
        return {
          status: "success" as const,
          outputValue: await textToSpeechOutput({
            ...props,
            step: jobData.data.step,
          }),
        }
      default: {
        const _exhaustive: never = jobData
        throw new Error(`Unhandled heavy step data: ${_exhaustive}`)
      }
    }
  } catch (err) {
    const error = normalizeError(err)
    logger.error(
      {
        err: error,
        conversationId: conversation.id,
        contactInboxId: contactInbox.id,
        jobType: jobData.type,
        workspaceId: conversation.workspaceId,
      },
      "Heavy step failed",
    )
    return { status: "error" as const, errorMessage: error.message }
  }
}

async function startHeavyWorker() {
  try {
    await ensureBootstrapped()
    logger.info("Heavy worker bootstrapped successfully")
  } catch (err) {
    logger.error({ err }, "Failed to bootstrap Heavy worker")
    process.exit(1)
  }

  const worker = new Worker(
    queueNames.enum.heavy,
    async (job: Job<HeavyJobData>) => {
      logger.info(job.data, `Heavy worker received job: ${job.id}`)

      const jobData = heavyJobDataSchema.parse(job.data)
      const workspaceId = await resolveWorkspaceId(jobData.data)
      if (await isBlockedWorkspace(workspaceId)) {
        return
      }

      return await runJobWithAuditContext(
        { workspaceId, source: `heavy:${jobData.type}` },
        async () => {
          switch (jobData.type) {
            case HeavyJobAction.processAIFile:
              await processAIFile(jobData.data)
              return
            case HeavyJobAction.aiEditImage:
            case HeavyJobAction.aiGenerateImage:
            case HeavyJobAction.aiSpeechToText:
            case HeavyJobAction.aiTextToSpeech:
              return await runHeavyStep(jobData)
            case HeavyJobAction.extractTextFromFile:
              return await extractFallbackTextSnippets(jobData.data)
            case HeavyJobAction.analyzeImage:
              return await analyzeImage(jobData.data)
            default: {
              const _exhaustive: never = jobData
              logger.warn(
                { data: _exhaustive, jobName: job.name },
                "Unhandled heavy job type",
              )
              return
            }
          }
        },
      )
    },
    {
      connection: getRedisConnection(),
      ...defaultWorkerOptions,
      concurrency: env.HEAVY_WORKER_CONCURRENCY,
    },
  )

  worker.on("failed", async (job, err) => {
    if (!job) {
      logger.error({ err }, "Heavy job failed without job context")
      return
    }

    const parsedJobData = heavyJobDataSchema.safeParse(job.data)
    logger.error(
      {
        err,
        jobId: job.id,
        jobName: job.name,
        jobType: parsedJobData.success ? parsedJobData.data.type : undefined,
        workspaceId: parsedJobData.success
          ? await resolveWorkspaceId(parsedJobData.data.data)
          : undefined,
      },
      "Heavy job failed",
    )
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
      logger.error({ err }, "[HeavyWorker] Error during shutdown")
      process.exit(1)
    }
  }
  process.once("SIGINT", shutdown)
  process.once("SIGTERM", shutdown)
}

startHeavyWorker().catch((err) => {
  logger.error({ err }, "Failed to start Heavy worker")
  process.exit(1)
})
