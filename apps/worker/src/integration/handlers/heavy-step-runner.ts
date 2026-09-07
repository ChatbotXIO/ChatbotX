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
  getHeavyJobCompletionWaitTimeoutMs,
  getHeavyJobOptions,
  getRedisConnection,
  HeavyJobAction,
  type HeavyJobData,
  type HeavyStepResultData,
  heavyJobDataSchema,
  heavyQueue,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { normalizeError } from "universal-error-normalizer"
import { z } from "zod"
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
  contactInboxId: string
  conversationId: string
  parentJobId: string
  stepId: string
}

const outcomeStateSchema = z.object({
  deadlineAt: z.number(),
  errorMessage: z.string().optional(),
  resumeLeaseToken: z.string().optional(),
  resumeLeaseUntil: z.number().optional(),
  resumeStatus: z.enum(["resuming", "resumed"]).optional(),
  status: z.enum(["pending", "writing", "succeeded", "failed"]),
  writingStartedAt: z.number().optional(),
})
type OutcomeState = z.infer<typeof outcomeStateSchema>
const OUTCOME_KEY_PREFIX = "heavy-step-outcome"
const STALE_WRITE_MS = 30_000

function isHeavyStepJobData(data: HeavyJobData): data is HeavyStepJobData {
  return "step" in data.data
}

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
export function buildHeavyOutcomeKey(input: HeavyJobIdInput): string {
  return `${OUTCOME_KEY_PREFIX}:${input.action}:${hash(stableJson(input))}`
}
function outcomeTtlMs(): number {
  return Math.max(env.HEAVY_JOB_WAIT_TIMEOUT_MS * 4, 10 * 60_000)
}

async function readOutcome(key: string): Promise<OutcomeState | null> {
  const raw = await getRedisConnection().get(key)
  if (!raw) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    const result = outcomeStateSchema.safeParse(parsed)
    if (result.success) {
      return result.data
    }
    logger.warn(
      { err: normalizeError(result.error), key },
      "[heavy-step] Invalid outcome state",
    )
  } catch (error) {
    logger.warn(
      { err: normalizeError(error), key },
      "[heavy-step] Invalid outcome state",
    )
  }
  return null
}

async function ensurePending(
  key: string,
  deadlineAt: number,
): Promise<OutcomeState> {
  await getRedisConnection().set(
    key,
    JSON.stringify({ deadlineAt, status: "pending" }),
    "PX",
    outcomeTtlMs(),
    "NX",
  )
  const outcome = await readOutcome(key)
  if (!outcome) {
    throw new Error("Heavy step outcome was not persisted")
  }
  return outcome
}

async function transitionOutcome(
  key: string,
  status: "writing" | "succeeded" | "failed",
  errorMessage?: string,
): Promise<string> {
  return String(
    await getRedisConnection().eval(
      `
local raw = redis.call("GET", KEYS[1])
if not raw then return "missing" end
local obj = cjson.decode(raw)
local now = tonumber(ARGV[1])
local nextStatus = ARGV[2]
if obj["status"] == "succeeded" or obj["status"] == "failed" then return obj["status"] end
if now > tonumber(obj["deadlineAt"]) then
  obj["status"] = "failed"
  obj["errorMessage"] = "Heavy step timed out"
  redis.call("SET", KEYS[1], cjson.encode(obj), "KEEPTTL")
  return "failed"
end
if nextStatus == "writing" then
  if obj["status"] == "pending" or (obj["status"] == "writing" and (not obj["writingStartedAt"] or now - tonumber(obj["writingStartedAt"]) > tonumber(ARGV[4]))) then
    obj["status"] = "writing"
    obj["writingStartedAt"] = now
    redis.call("SET", KEYS[1], cjson.encode(obj), "KEEPTTL")
    return "writing"
  end
  return obj["status"]
end
obj["status"] = nextStatus
obj["writingStartedAt"] = nil
if nextStatus == "failed" then obj["errorMessage"] = ARGV[3] end
redis.call("SET", KEYS[1], cjson.encode(obj), "KEEPTTL")
return nextStatus
`,
      1,
      key,
      Date.now().toString(),
      status,
      errorMessage ?? "Heavy step failed",
      STALE_WRITE_MS.toString(),
    ),
  )
}

export async function claimHeavyStepResume(input: {
  outcomeKey: string
  resumeLeaseToken: string
}): Promise<"claimed" | "pending" | "resumed"> {
  return String(
    await getRedisConnection().eval(
      `
local raw = redis.call("GET", KEYS[1])
if not raw then return "resumed" end
local obj = cjson.decode(raw)
local now = tonumber(ARGV[1])
if obj["status"] == "pending" or obj["status"] == "writing" then
  if now < tonumber(obj["deadlineAt"]) then return "pending" end
  obj["status"] = "failed"
  obj["errorMessage"] = "Heavy step timed out"
  obj["writingStartedAt"] = nil
end
if obj["resumeStatus"] == "resumed" then return "resumed" end
if obj["resumeStatus"] == "resuming" and tonumber(obj["resumeLeaseUntil"] or 0) > now then return "pending" end
obj["resumeStatus"] = "resuming"
obj["resumeLeaseToken"] = ARGV[2]
obj["resumeLeaseUntil"] = now + tonumber(ARGV[3])
redis.call("SET", KEYS[1], cjson.encode(obj), "KEEPTTL")
return "claimed"
`,
      1,
      input.outcomeKey,
      Date.now().toString(),
      input.resumeLeaseToken,
      STALE_WRITE_MS.toString(),
    ),
  ) as "claimed" | "pending" | "resumed"
}

export async function finishHeavyStepResume(input: {
  outcomeKey: string
  resumeLeaseToken: string
  succeeded: boolean
}): Promise<void> {
  await getRedisConnection().eval(
    `
local raw = redis.call("GET", KEYS[1])
if not raw then return end
local obj = cjson.decode(raw)
if obj["resumeLeaseToken"] ~= ARGV[1] then return end
if ARGV[2] == "true" then
  obj["resumeStatus"] = "resumed"
else
  obj["resumeStatus"] = nil
end
obj["resumeLeaseToken"] = nil
obj["resumeLeaseUntil"] = nil
redis.call("SET", KEYS[1], cjson.encode(obj), "KEEPTTL")
`,
    1,
    input.outcomeKey,
    input.resumeLeaseToken,
    input.succeeded.toString(),
  )
}

export async function shouldRunHeavyStep(outcomeKey: string): Promise<boolean> {
  const outcome = await readOutcome(outcomeKey)
  return outcome?.status === "pending"
}

export async function completeHeavyStep(input: {
  contactId: string
  contactInboxId: string
  outcomeKey: string
  outputFieldId?: string
  result: HeavyStepResultData
  workspaceId: string
}): Promise<void> {
  if (input.result.status === "error") {
    await transitionOutcome(
      input.outcomeKey,
      "failed",
      input.result.errorMessage,
    )
    return
  }
  if (input.outputFieldId) {
    const claim = await transitionOutcome(input.outcomeKey, "writing")
    if (claim !== "writing") {
      return
    }
    await saveResultToCustomField({
      contactId: input.contactId,
      contactInboxId: input.contactInboxId,
      customFieldId: input.outputFieldId,
      fullText: input.result.outputValue,
      workspaceId: input.workspaceId,
    })
  }
  await transitionOutcome(input.outcomeKey, "succeeded")
}

export async function failHeavyStep(
  outcomeKey: string,
  error: unknown,
): Promise<void> {
  await transitionOutcome(outcomeKey, "failed", normalizeError(error).message)
}

function buildContinuation<T>(props: HeavyStepProps<T>) {
  return {
    appointmentId: props.appointmentId,
    commentAnchor: props.commentAnchor,
    flowExecutionKey: props.flowExecutionKey,
    flowId: props.flowVersion.flowId,
    flowVersionId: props.useLatestFlowVersion
      ? undefined
      : props.flowVersion.id,
    metadata: props.metadata,
    nodeId: props.targetNodeId,
    nodeVisits: props.nodeVisits,
    sendFrom: props.sendFrom,
    targetId: props.targetId,
    // Only button and quick-reply targets are queue-level variants. Node and
    // step execution re-enters through nodeId + startFromStepId.
    targetType:
      props.targetType === "button" || props.targetType === "quickReply"
        ? props.targetType
        : undefined,
    trackingContext: props.trackingContext,
  }
}

function buildHeavyStepJobData(
  action: HeavyStepRunnerAction,
  props: HeavyStepProps<
    | AIEditImageSchema
    | AIGenerateImageSchema
    | AISpeechToTextSchema
    | AITextToSpeechSchema
  >,
  outcomeKey: string,
): HeavyStepJobData {
  const baseData = {
    contactInboxId: props.contactInbox.id,
    continuation: buildContinuation(props),
    conversationId: props.conversation.id,
    metadata: props.metadata,
    outcomeKey,
  }
  const data = (() => {
    switch (action) {
      case HeavyJobAction.aiEditImage:
        return {
          type: action,
          data: { ...baseData, step: aiEditImageSchema.parse(props.step) },
        }
      case HeavyJobAction.aiGenerateImage:
        return {
          type: action,
          data: { ...baseData, step: aiGenerateImageSchema.parse(props.step) },
        }
      case HeavyJobAction.aiSpeechToText:
        return {
          type: action,
          data: { ...baseData, step: aiSpeechToTextSchema.parse(props.step) },
        }
      case HeavyJobAction.aiTextToSpeech:
        return {
          type: action,
          data: { ...baseData, step: aiTextToSpeechSchema.parse(props.step) },
        }
      default: {
        const exhaustiveAction: never = action
        throw new Error(`Unsupported heavy step action: ${exhaustiveAction}`)
      }
    }
  })()
  const parsed = heavyJobDataSchema.parse(data)
  if (!isHeavyStepJobData(parsed)) {
    throw new Error("Expected a heavy flow-step job")
  }
  return parsed
}

export async function runViaHeavyWorker(
  action: HeavyStepRunnerAction,
  props: HeavyStepProps<
    | AIEditImageSchema
    | AIGenerateImageSchema
    | AISpeechToTextSchema
    | AITextToSpeechSchema
  >,
): Promise<ExecuteStepResult> {
  const identity = {
    action,
    contactInboxId: props.contactInbox.id,
    conversationId: props.conversation.id,
    parentJobId: props.flowExecutionKey,
    stepId: props.step.id,
  }
  const outcomeKey = buildHeavyOutcomeKey(identity)
  const completionWaitTimeoutMs = getHeavyJobCompletionWaitTimeoutMs(
    action,
    env.HEAVY_JOB_WAIT_TIMEOUT_MS,
  )
  const outcome = await ensurePending(
    outcomeKey,
    Date.now() + completionWaitTimeoutMs,
  )
  if (outcome.status === "succeeded") {
    return { result: null, status: "success" }
  }
  if (outcome.status === "failed") {
    return {
      errorMessage: outcome.errorMessage ?? "Heavy step failed",
      result: null,
      status: "error",
    }
  }
  if (outcome.status === "writing") {
    return { result: null, status: "wait" }
  }
  await heavyQueue.add(
    action,
    buildHeavyStepJobData(action, props, outcomeKey),
    {
      ...getHeavyJobOptions(action),
      jobId: buildHeavyJobId(identity),
    },
  )
  await integrationQueue.add(
    IntegrationJobAction.resumeHeavyStep,
    {
      type: IntegrationJobAction.resumeHeavyStep,
      data: {
        ...buildContinuation(props),
        contactInboxId: props.contactInbox.id,
        conversationId: props.conversation.id,
        outcomeKey,
        startFromStepId: props.step.id,
      },
    },
    {
      delay: completionWaitTimeoutMs,
      jobId: `heavy-resume-fallback-${hash(stableJson(identity))}`,
    },
  )
  return { result: null, status: "wait" }
}
