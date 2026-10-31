import { aiFileService } from "@chatbotx.io/business"
import { optimizeStoredImage } from "@chatbotx.io/business/media/optimize-stored-image"
import {
  type HeavyFlowContinuation,
  HeavyJobAction,
  type HeavyJobData,
  type HeavyStepResultData,
  heavyJobDataSchema,
  heavyStepResultSchema,
  IntegrationJobAction,
  integrationQueue,
  queueNames,
} from "@chatbotx.io/worker-config"
import { type Job, UnrecoverableError } from "bullmq"
import { normalizeError } from "universal-error-normalizer"
import { env } from "../env"
import {
  completeHeavyStep,
  failHeavyStep,
  resolveHeavyStepAttempt,
} from "../integration/handlers/heavy-step-runner"
import { createQueueWorker } from "../lib/create-queue-worker"
import { detectConversationAndContactInbox } from "../lib/db"
import { recordHeavyMetric } from "../lib/heavy-metrics"
import { isBlockedWorkspace } from "../lib/is-blocked-workspace"
import { logger } from "../lib/logger"
import { resolveWorkspaceId } from "../lib/resolve-workspace-id"
import { runJobWithAuditContext } from "../lib/run-job-with-audit-context"
import { runWorker } from "../lib/shutdown"
import { AIFileProcessingError } from "./handlers/ai-file-processing-error"
import { analyzeImage } from "./handlers/analyze-image"
import { editImageOutput } from "./handlers/edit-image"
import {
  isExpectedHeavyStepError,
  isRetryableHeavyError,
} from "./handlers/errors"
import { extractFallbackTextSnippets } from "./handlers/extract-text-from-file"
import { generateImageOutput } from "./handlers/generate-image"
import { processAIFile } from "./handlers/process-ai-file"
import { recordHeavyAIStepProviderError } from "./handlers/provider-error"
import { speechToTextOutput } from "./handlers/speech-to-text"
import { textToSpeechOutput } from "./handlers/text-to-speech"
import { waitForHeavyProviderSlot } from "./services/provider-rate-limiter"
import { getMaxHeavyStepAttemptBudgetMs } from "./timeouts"

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

function getHeavyStepProvider(jobData: HeavyStepJobData) {
  return jobData.data.step.provider
}

function getProviderForRateLimit(jobData: HeavyJobData): string | undefined {
  if (isHeavyFlowStep(jobData)) {
    return getHeavyStepProvider(jobData)
  }
  if (jobData.type === HeavyJobAction.analyzeImage) {
    return "provider" in jobData.data.providerInfo
      ? jobData.data.providerInfo.provider
      : "openaiCompatible"
  }
}

function isHeavyFlowStep(jobData: HeavyJobData): jobData is HeavyStepJobData {
  return "step" in jobData.data
}

async function resumeHeavyFlow(input: {
  contactInboxId: string
  continuation: HeavyFlowContinuation
  conversationId: string
  jobId: string | undefined
  outcomeKey: string
  stepId: string
}): Promise<void> {
  await integrationQueue.add(
    IntegrationJobAction.resumeHeavyStep,
    {
      type: IntegrationJobAction.resumeHeavyStep,
      data: {
        appointmentId: input.continuation.appointmentId,
        commentAnchor: input.continuation.commentAnchor,
        contactInboxId: input.contactInboxId,
        conversationId: input.conversationId,
        flowExecutionKey: input.continuation.flowExecutionKey,
        flowId: input.continuation.flowId,
        flowVersionId: input.continuation.flowVersionId,
        metadata: input.continuation.metadata,
        nodeId: input.continuation.nodeId,
        nodeVisits: input.continuation.nodeVisits,
        outcomeKey: input.outcomeKey,
        sendFrom: input.continuation.sendFrom,
        sentByUserId: input.continuation.sentByUserId,
        startFromStepId: input.stepId,
        targetId: input.continuation.targetId,
        targetType: input.continuation.targetType,
        trackingContext: input.continuation.trackingContext,
      },
    },
    {
      jobId: `heavy-resume-${input.jobId ?? input.continuation.flowExecutionKey}`,
    },
  )
}

async function runHeavyStep(
  jobData: HeavyStepJobData,
  job: Job<HeavyJobData>,
): Promise<HeavyStepResultData> {
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
          status: "success",
          outputValues: [
            {
              customFieldId: jobData.data.step.outputFieldId,
              value: await editImageOutput({
                ...props,
                step: jobData.data.step,
              }),
            },
          ],
        }
      case HeavyJobAction.aiGenerateImage:
        return {
          status: "success",
          outputValues: [
            {
              customFieldId: jobData.data.step.outputFieldId,
              value: await generateImageOutput({
                ...props,
                step: jobData.data.step,
              }),
            },
          ],
        }
      case HeavyJobAction.aiSpeechToText:
        return {
          status: "success",
          outputValues: [
            {
              customFieldId: jobData.data.step.outputFieldId,
              value: await speechToTextOutput({
                ...props,
                // BullMQ keeps the job id across retries, so Meta sees one
                // session for every attempt of this step run.
                sessionId:
                  job.id ?? jobData.data.outcomeKey ?? jobData.data.step.id,
                step: jobData.data.step,
              }),
            },
          ],
        }
      case HeavyJobAction.aiTextToSpeech:
        return {
          status: "success",
          outputValues: [
            {
              customFieldId: jobData.data.step.outputFieldId,
              value: await textToSpeechOutput({
                ...props,
                step: jobData.data.step,
              }),
            },
          ],
        }
      default: {
        const _exhaustive: never = jobData
        throw new Error(`Unhandled heavy step data: ${_exhaustive}`)
      }
    }
  } catch (err) {
    const error = normalizeError(err)
    await recordHeavyAIStepProviderError({
      provider: getHeavyStepProvider(jobData),
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      sourceId: contactInbox.sourceId,
      error: err,
    })

    logger.error(
      {
        err: error,
        conversationId: conversation.id,
        contactInboxId: contactInbox.id,
        jobId: job.id,
        jobType: jobData.type,
        workspaceId: conversation.workspaceId,
        retryable: isRetryableHeavyError(err),
      },
      "Heavy step failed",
    )

    if (!isExpectedHeavyStepError(err) && isRetryableHeavyError(err)) {
      throw err
    }

    return { status: "error", errorMessage: error.message }
  }
}

async function handleHeavyJobFailed(
  job: Job<HeavyJobData> | undefined,
  err: Error,
): Promise<void> {
  if (!job) {
    logger.error(
      { err: normalizeError(err) },
      "Heavy job failed without job context",
    )
    return
  }

  const parsedJobData = heavyJobDataSchema.safeParse(job.data)
  let workspaceId: string | undefined
  let workspaceResolutionError: ReturnType<typeof normalizeError> | undefined
  if (parsedJobData.success) {
    try {
      workspaceId = await resolveWorkspaceId(parsedJobData.data.data)
    } catch (resolutionError) {
      workspaceResolutionError = normalizeError(resolutionError)
    }
  }

  logger.error(
    {
      err: normalizeError(err),
      jobId: job.id,
      jobName: job.name,
      jobType: parsedJobData.success ? parsedJobData.data.type : undefined,
      workspaceId,
      workspaceResolutionError,
    },
    "Heavy job failed",
  )
  if (
    parsedJobData.success &&
    parsedJobData.data.type === HeavyJobAction.processAIFile &&
    parsedJobData.data.data.runId &&
    // An unrecoverable error fails the job on its first attempt, so the
    // attempts count alone would leave the run in `processing`.
    (err instanceof UnrecoverableError ||
      job.attemptsMade >= (job.opts.attempts ?? 1))
  ) {
    const { aiFileId, runId } = parsedJobData.data.data
    if (workspaceId) {
      try {
        await aiFileService.markProcessingRunFailed({
          aiFileId,
          workspaceId,
          runId,
          code: err instanceof AIFileProcessingError ? err.code : "unknown",
        })
      } catch (markError) {
        logger.error(
          { err: normalizeError(markError), aiFileId, workspaceId, runId },
          "Failed to mark AI file processing run failed",
        )
      }
    } else {
      // The run expires after AI_FILE_PROCESSING_RUN_STALE_MS instead.
      logger.error(
        { err: workspaceResolutionError, aiFileId, runId },
        "Cannot mark AI file processing run failed without a workspace",
      )
    }
  }
  if (
    parsedJobData.success &&
    isHeavyFlowStep(parsedJobData.data) &&
    parsedJobData.data.data.outcomeKey &&
    parsedJobData.data.data.continuation &&
    job.attemptsMade >= (job.opts.attempts ?? 1)
  ) {
    await failHeavyStep(parsedJobData.data.data.outcomeKey, err)
    await resumeHeavyFlow({
      contactInboxId: parsedJobData.data.data.contactInboxId,
      continuation: parsedJobData.data.data.continuation,
      conversationId: parsedJobData.data.data.conversationId,
      jobId: job.id,
      outcomeKey: parsedJobData.data.data.outcomeKey,
      stepId: parsedJobData.data.data.step.id,
    })
  }
  recordHeavyMetric({
    action: parsedJobData.success ? parsedJobData.data.type : undefined,
    attempts: job.attemptsMade,
    event: "failed",
    outcome: isRetryableHeavyError(err) ? "retryable_failed" : "failed",
  })
}

function startHeavyWorker() {
  const worker = createQueueWorker(
    queueNames.enum.heavy,
    async (job: Job<HeavyJobData>) => {
      logger.debug(
        { jobId: job.id, type: job.data.type },
        "Heavy worker received job",
      )

      const jobData = heavyJobDataSchema.parse(job.data)
      const startedAt = performance.now()
      const provider = getProviderForRateLimit(jobData)
      const queueWaitMs = Math.max(0, Date.now() - job.timestamp)
      recordHeavyMetric({
        action: jobData.type,
        attempts: job.attemptsMade,
        event: "received",
        provider,
        queueWaitMs,
      })
      recordHeavyMetric({
        action: jobData.type,
        attempts: job.attemptsMade,
        event: "started",
        provider,
        queueWaitMs,
      })
      const workspaceId = await resolveWorkspaceId(jobData.data)
      if (await isBlockedWorkspace(workspaceId)) {
        return
      }

      const outcomeKey = isHeavyFlowStep(jobData)
        ? jobData.data.outcomeKey
        : undefined
      const attempt = outcomeKey
        ? await resolveHeavyStepAttempt(outcomeKey)
        : undefined
      if (attempt?.action === "skip") {
        logger.info(
          { jobId: job.id, outcomeKey },
          "Heavy flow step already reached a terminal outcome",
        )
        return
      }
      // A retry after a partial write replays the stored values: no provider
      // call, so no provider slot either.
      const replayed: HeavyStepResultData | undefined =
        attempt?.action === "replay"
          ? { status: "success", outputValues: attempt.outputValues }
          : undefined
      if (replayed) {
        logger.info(
          {
            action: jobData.type,
            jobId: job.id,
            outcomeKey,
          },
          "Replaying stored heavy step output",
        )
      }

      if (
        !replayed &&
        provider &&
        workspaceId &&
        env.HEAVY_PROVIDER_MIN_INTERVAL_MS > 0
      ) {
        await waitForHeavyProviderSlot({
          minIntervalMs: env.HEAVY_PROVIDER_MIN_INTERVAL_MS,
          provider,
          workspaceId,
        })
      }

      const providerStartedAt =
        provider && !replayed ? performance.now() : undefined
      const result =
        replayed ??
        (await runJobWithAuditContext(
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
                return await runHeavyStep(jobData, job)
              case HeavyJobAction.extractTextFromFile:
                return await extractFallbackTextSnippets(jobData.data)
              case HeavyJobAction.analyzeImage:
                return await analyzeImage(jobData.data)
              case HeavyJobAction.optimizeStoredImage: {
                // One info line per job: outcome plus bytes before/after, so
                // storage savings and skip reasons can be read off the logs.
                const startedAt = Date.now()
                const result = await optimizeStoredImage(jobData.data)
                logger.info(
                  {
                    jobId: job.id,
                    kind: jobData.data.kind,
                    workspaceId: jobData.data.workspaceId,
                    ...result,
                    durationMs: Date.now() - startedAt,
                  },
                  "Stored image optimization finished",
                )
                return
              }
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
        ))

      const stepResult = heavyStepResultSchema.safeParse(result)
      if (
        !stepResult.success &&
        isHeavyFlowStep(jobData) &&
        jobData.data.outcomeKey &&
        jobData.data.continuation
      ) {
        // A malformed producer result must not leave the flow waiting for
        // the fallback deadline with no reason logged.
        logger.error(
          {
            err: normalizeError(stepResult.error),
            action: jobData.type,
            conversationId: jobData.data.conversationId,
            jobId: job.id,
            workspaceId,
          },
          "Heavy step returned an invalid result",
        )
        await failHeavyStep(jobData.data.outcomeKey, stepResult.error)
        await resumeHeavyFlow({
          contactInboxId: jobData.data.contactInboxId,
          continuation: jobData.data.continuation,
          conversationId: jobData.data.conversationId,
          jobId: job.id,
          outcomeKey: jobData.data.outcomeKey,
          stepId: jobData.data.step.id,
        })
      }
      if (
        stepResult.success &&
        isHeavyFlowStep(jobData) &&
        jobData.data.outcomeKey &&
        jobData.data.continuation
      ) {
        const { conversation, contactInbox } =
          await detectConversationAndContactInbox({
            conversationId: jobData.data.conversationId,
            contactInboxId: jobData.data.contactInboxId,
          })
        await completeHeavyStep({
          contactId: conversation.contactId,
          contactInboxId: contactInbox.id,
          outcomeKey: jobData.data.outcomeKey,
          result: stepResult.data,
          workspaceId: conversation.workspaceId,
        })
        await resumeHeavyFlow({
          contactInboxId: contactInbox.id,
          continuation: jobData.data.continuation,
          conversationId: conversation.id,
          jobId: job.id,
          outcomeKey: jobData.data.outcomeKey,
          stepId: jobData.data.step.id,
        })
      }
      recordHeavyMetric({
        action: jobData.type,
        attempts: job.attemptsMade,
        durationMs: Math.round(performance.now() - startedAt),
        event: "completed",
        outcome:
          stepResult.success && stepResult.data.status === "error"
            ? "expected_error"
            : "completed",
        providerLatencyMs:
          providerStartedAt === undefined
            ? undefined
            : Math.round(performance.now() - providerStartedAt),
        provider,
      })
      return result
    },
    {
      concurrency: env.HEAVY_WORKER_CONCURRENCY,
      // AI provider calls are allowed to run for the longest heavy-step
      // attempt (HEAVY_JOB_WAIT_TIMEOUT_MS, or MUSE_TRANSCRIBE_TIMEOUT_MS for
      // Muse Speech to Text); keep the BullMQ lock alive for that budget plus
      // a small handoff margin so a slow provider cannot be redelivered while
      // still running.
      lockDuration: Math.max(
        getMaxHeavyStepAttemptBudgetMs() + 60_000,
        5 * 60_000,
      ),
      stalledInterval: 60_000,
      maxStalledCount: 1,
      onFailed: handleHeavyJobFailed,
    },
  )

  worker.on("stalled", (jobId) => {
    recordHeavyMetric({ event: "stalled", outcome: "retryable_failed" })
    logger.warn({ jobId }, "Heavy job stalled")
  })
}

runWorker("heavy", startHeavyWorker)
