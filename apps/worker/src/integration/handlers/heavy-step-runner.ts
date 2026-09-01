import { createHash } from "node:crypto"
import {
  type AIEditImageSchema,
  type AIGenerateImageSchema,
  type AISpeechToTextSchema,
  type AITextToSpeechSchema,
  aiEditImageSchema,
  aiGenerateImageSchema,
  aiSpeechToTextSchema,
  aiTextToSpeechSchema,
} from "@chatbotx.io/flow-config"
import {
  getHeavyQueueEvents,
  getRedisConnection,
  HeavyJobAction,
  type HeavyJobData,
  heavyQueue,
  heavyStepResultSchema,
} from "@chatbotx.io/worker-config"
import { normalizeError } from "universal-error-normalizer"
import { env } from "../../env"
import { logger } from "../../lib/logger"
import { saveResultToCustomField } from "../utils/contact"
import type { HeavyStepProps } from "./flow-utils"
import type { ExecuteStepResult } from "./step"

type HeavyStepRunnerAction = Extract<
  HeavyJobAction,
  "aiEditImage" | "aiGenerateImage" | "aiSpeechToText" | "aiTextToSpeech"
>

type HeavyStepJobData = Extract<HeavyJobData, { type: HeavyStepRunnerAction }>

type HeavyJobIdInput = {
  action: HeavyStepRunnerAction
  parentJobId: string
  conversationId: string
  contactInboxId: string
  stepId: string
}

type HeavyOutcomeState = "pending" | "succeeded" | "timed_out"

const outcomeKeyPrefix = "heavy-step-outcome"

function stableJson(input: HeavyJobIdInput): string {
  return JSON.stringify({
    action: input.action,
    contactInboxId: input.contactInboxId,
    conversationId: input.conversationId,
    parentJobId: input.parentJobId,
    stepId: input.stepId,
  })
}

function hash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 32)
}

export function buildHeavyJobId(input: HeavyJobIdInput): string {
  return `heavy-${input.action}-${hash(stableJson(input))}`
}

function buildOutcomeKey(input: HeavyJobIdInput): string {
  return `${outcomeKeyPrefix}:${input.action}:${hash(stableJson(input))}`
}

function outcomeTtlMs(): number {
  return Math.max(env.HEAVY_JOB_WAIT_TIMEOUT_MS * 4, 10 * 60_000)
}

async function readOutcomeState(
  key: string,
): Promise<{ status: HeavyOutcomeState; deadlineAt: number } | null> {
  const raw = await getRedisConnection().get(key)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as {
      status?: unknown
      deadlineAt?: unknown
    }
    if (
      (parsed.status === "pending" ||
        parsed.status === "succeeded" ||
        parsed.status === "timed_out") &&
      typeof parsed.deadlineAt === "number"
    ) {
      return { status: parsed.status, deadlineAt: parsed.deadlineAt }
    }
  } catch (err) {
    logger.warn({ err, key }, "[heavy-step] Invalid outcome state in Redis")
  }

  return null
}

async function ensurePendingOutcome(
  key: string,
  deadlineAt: number,
): Promise<HeavyOutcomeState> {
  const redis = getRedisConnection()
  await redis.set(
    key,
    JSON.stringify({ status: "pending", deadlineAt }),
    "PX",
    outcomeTtlMs(),
    "NX",
  )

  const state = await readOutcomeState(key)
  if (!state) {
    return "timed_out"
  }

  if (state.status === "pending" && Date.now() > state.deadlineAt) {
    return await markOutcomeTimedOut(key)
  }

  return state.status
}

async function markOutcomeTimedOut(key: string): Promise<HeavyOutcomeState> {
  const result = await getRedisConnection().eval(
    `
local raw = redis.call("GET", KEYS[1])
if not raw then
  return "timed_out"
end
local obj = cjson.decode(raw)
if obj["status"] == "pending" then
  obj["status"] = "timed_out"
  redis.call("SET", KEYS[1], cjson.encode(obj), "KEEPTTL")
  return "timed_out"
end
return obj["status"]
`,
    1,
    key,
  )

  return result === "succeeded" ? "succeeded" : "timed_out"
}

async function markOutcomeSucceeded(key: string): Promise<HeavyOutcomeState> {
  const result = await getRedisConnection().eval(
    `
local raw = redis.call("GET", KEYS[1])
if not raw then
  return "timed_out"
end
local obj = cjson.decode(raw)
if obj["status"] == "pending" and tonumber(ARGV[1]) <= tonumber(obj["deadlineAt"]) then
  obj["status"] = "succeeded"
  redis.call("SET", KEYS[1], cjson.encode(obj), "KEEPTTL")
  return "succeeded"
end
return obj["status"]
`,
    1,
    key,
    Date.now().toString(),
  )

  return result === "succeeded" ? "succeeded" : "timed_out"
}

function buildHeavyStepJobData(
  action: HeavyStepRunnerAction,
  props: HeavyStepProps<
    | AIEditImageSchema
    | AIGenerateImageSchema
    | AISpeechToTextSchema
    | AITextToSpeechSchema
  >,
): HeavyStepJobData {
  const baseData = {
    conversationId: props.conversation.id,
    contactInboxId: props.contactInbox.id,
    metadata: props.metadata,
  }

  switch (action) {
    case HeavyJobAction.aiEditImage:
      return {
        type: HeavyJobAction.aiEditImage,
        data: { ...baseData, step: aiEditImageSchema.parse(props.step) },
      }
    case HeavyJobAction.aiGenerateImage:
      return {
        type: HeavyJobAction.aiGenerateImage,
        data: { ...baseData, step: aiGenerateImageSchema.parse(props.step) },
      }
    case HeavyJobAction.aiSpeechToText:
      return {
        type: HeavyJobAction.aiSpeechToText,
        data: { ...baseData, step: aiSpeechToTextSchema.parse(props.step) },
      }
    case HeavyJobAction.aiTextToSpeech:
      return {
        type: HeavyJobAction.aiTextToSpeech,
        data: { ...baseData, step: aiTextToSpeechSchema.parse(props.step) },
      }
    default: {
      const _exhaustive: never = action
      throw new Error(`Unsupported heavy step action: ${_exhaustive}`)
    }
  }
}

export function runViaHeavyWorker(
  action: typeof HeavyJobAction.aiEditImage,
  props: HeavyStepProps<AIEditImageSchema>,
): Promise<ExecuteStepResult>
export function runViaHeavyWorker(
  action: typeof HeavyJobAction.aiGenerateImage,
  props: HeavyStepProps<AIGenerateImageSchema>,
): Promise<ExecuteStepResult>
export function runViaHeavyWorker(
  action: typeof HeavyJobAction.aiSpeechToText,
  props: HeavyStepProps<AISpeechToTextSchema>,
): Promise<ExecuteStepResult>
export function runViaHeavyWorker(
  action: typeof HeavyJobAction.aiTextToSpeech,
  props: HeavyStepProps<AITextToSpeechSchema>,
): Promise<ExecuteStepResult>
export async function runViaHeavyWorker(
  action: HeavyStepRunnerAction,
  props: HeavyStepProps<
    | AIEditImageSchema
    | AIGenerateImageSchema
    | AISpeechToTextSchema
    | AITextToSpeechSchema
  >,
): Promise<ExecuteStepResult> {
  const idInput = {
    action,
    parentJobId: props.flowExecutionKey,
    conversationId: props.conversation.id,
    contactInboxId: props.contactInbox.id,
    stepId: props.step.id,
  }
  const outcomeKey = buildOutcomeKey(idInput)
  const deadlineAt = Date.now() + env.HEAVY_JOB_WAIT_TIMEOUT_MS
  const outcome = await ensurePendingOutcome(outcomeKey, deadlineAt)

  if (outcome === "timed_out") {
    return {
      status: "error",
      errorMessage: "Heavy step already timed out",
      result: null,
    }
  }

  if (outcome === "succeeded") {
    return { status: "success", result: null }
  }

  const jobId = buildHeavyJobId(idInput)

  try {
    const job = await heavyQueue.add(
      action,
      buildHeavyStepJobData(action, props),
      { jobId, removeOnComplete: { count: 200 }, removeOnFail: { count: 500 } },
    )

    if (!(job && typeof job === "object" && "waitUntilFinished" in job)) {
      throw new Error("Heavy queue did not return a waitable job")
    }

    const rawResult = await job.waitUntilFinished(
      getHeavyQueueEvents(),
      env.HEAVY_JOB_WAIT_TIMEOUT_MS,
    )
    const result = heavyStepResultSchema.parse(rawResult)

    if (result.status === "error") {
      await markOutcomeTimedOut(outcomeKey)
      return {
        status: "error",
        errorMessage: result.errorMessage,
        result: null,
      }
    }

    const successOutcome = await markOutcomeSucceeded(outcomeKey)
    if (successOutcome !== "succeeded") {
      return {
        status: "error",
        errorMessage: "Heavy step completed after its deadline",
        result: null,
      }
    }

    if (props.step.outputFieldId) {
      await saveResultToCustomField({
        contactId: props.conversation.contactId,
        customFieldId: props.step.outputFieldId,
        fullText: result.outputValue,
        workspaceId: props.conversation.workspaceId,
        contactInboxId: props.contactInbox.id,
      })
    }

    return { status: "success", result: null }
  } catch (err) {
    const error = normalizeError(err)
    await markOutcomeTimedOut(outcomeKey)
    logger.error(
      {
        err: error,
        action,
        conversationId: props.conversation.id,
        contactInboxId: props.contactInbox.id,
        jobId,
      },
      "Heavy step timed out or failed",
    )
    return { status: "error", errorMessage: error.message, result: null }
  }
}
