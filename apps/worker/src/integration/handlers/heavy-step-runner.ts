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
  heavyStepOutputValueSchema,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { normalizeError } from "universal-error-normalizer"
import { z } from "zod"
import { env } from "../../env"
import { getHeavyStepAttemptBudgetMs } from "../../heavy/timeouts"
import { logger } from "../../lib/logger"
import { saveResultToCustomField } from "../utils/contact"
import type { HeavyStepProps } from "./flow-utils"
import type { ExecuteStepResult } from "./step"

type HeavyStepRunnerAction = Extract<
  HeavyJobAction,
  "aiEditImage" | "aiGenerateImage" | "aiSpeechToText" | "aiTextToSpeech"
>
type HeavyStepRunnerStep =
  | AIEditImageSchema
  | AIGenerateImageSchema
  | AISpeechToTextSchema
  | AITextToSpeechSchema
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
  // Stored when the write is claimed, so a retry after a partial write
  // replays these values instead of calling the provider again.
  outputValues: z.array(heavyStepOutputValueSchema).optional(),
  resumeLeaseToken: z.string().optional(),
  resumeLeaseUntil: z.number().optional(),
  resumeStatus: z.enum(["resuming", "resumed"]).optional(),
  // Which branch a succeeded step routes to. Records written before skip
  // existed have no value and mean success.
  resultStatus: z.enum(["success", "skip"]).optional(),
  status: z.enum(["pending", "writing", "succeeded", "failed"]),
  writingStartedAt: z.number().optional(),
})
type OutcomeState = z.infer<typeof outcomeStateSchema>
type HeavyStepOutputValue = z.infer<typeof heavyStepOutputValueSchema>
const OUTCOME_KEY_PREFIX = "heavy-step-outcome"
// Only covers one or two `setValueByKey` calls. Must stay below the smallest
// heavy-step backoff (15s) so a speech retry also sees the write as stale and
// replays it.
const STALE_WRITE_MS = 10_000
// The resume lease spans a whole `runFlowNode`, not just the field writes.
const RESUME_LEASE_MS = 30_000
const writeClaimSchema = z.object({
  claim: z.literal("writing"),
  outputValues: z.array(heavyStepOutputValueSchema).optional(),
})

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
/**
 * The per-run identity shared by the job id and outcome key. Stable across
 * retries of one step execution, different for every later execution.
 */
export function buildHeavyStepIdentityHash(input: HeavyJobIdInput): string {
  return hash(stableJson(input))
}
export function buildHeavyJobId(input: HeavyJobIdInput): string {
  return `heavy-${input.action}-${buildHeavyStepIdentityHash(input)}`
}
export function buildHeavyOutcomeKey(input: HeavyJobIdInput): string {
  return `${OUTCOME_KEY_PREFIX}:${input.action}:${buildHeavyStepIdentityHash(input)}`
}
// The key must outlive its own deadline, which a long Muse step pushes
// past the 10-minute floor.
function outcomeTtlMs(completionWaitTimeoutMs: number): number {
  return Math.max(
    env.HEAVY_JOB_WAIT_TIMEOUT_MS * 4,
    10 * 60_000,
    completionWaitTimeoutMs * 2,
  )
}

async function readOutcome(key: string): Promise<OutcomeState | null> {
  const raw = await getRedisConnection("hot").get(key)
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
  completionWaitTimeoutMs: number,
): Promise<OutcomeState> {
  await getRedisConnection("hot").set(
    key,
    JSON.stringify({
      deadlineAt: Date.now() + completionWaitTimeoutMs,
      status: "pending",
    }),
    "PX",
    outcomeTtlMs(completionWaitTimeoutMs),
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
  options: {
    errorMessage?: string
    outputValues?: HeavyStepOutputValue[]
    resultStatus?: "success" | "skip"
  } = {},
): Promise<string> {
  return String(
    await getRedisConnection("hot").eval(
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
  obj["outputValues"] = nil
  redis.call("SET", KEYS[1], cjson.encode(obj), "KEEPTTL")
  return "failed"
end
if nextStatus == "writing" then
  if obj["status"] == "pending" or (obj["status"] == "writing" and (not obj["writingStartedAt"] or now - tonumber(obj["writingStartedAt"]) > tonumber(ARGV[4]))) then
    obj["status"] = "writing"
    obj["writingStartedAt"] = now
    -- A stale reclaim keeps the values the first claim stored.
    if obj["outputValues"] == nil and ARGV[6] ~= "" then
      obj["outputValues"] = cjson.decode(ARGV[6])
    end
    redis.call("SET", KEYS[1], cjson.encode(obj), "KEEPTTL")
    return cjson.encode({ claim = "writing", outputValues = obj["outputValues"] })
  end
  if obj["status"] == "writing" then return "busy" end
  return obj["status"]
end
obj["status"] = nextStatus
obj["writingStartedAt"] = nil
obj["outputValues"] = nil
if nextStatus == "failed" then obj["errorMessage"] = ARGV[3] end
if nextStatus == "succeeded" then obj["resultStatus"] = ARGV[5] end
redis.call("SET", KEYS[1], cjson.encode(obj), "KEEPTTL")
return nextStatus
`,
      1,
      key,
      Date.now().toString(),
      status,
      options.errorMessage ?? "Heavy step failed",
      STALE_WRITE_MS.toString(),
      options.resultStatus ?? "success",
      options.outputValues ? JSON.stringify(options.outputValues) : "",
    ),
  )
}

function parseWriteClaim(raw: string) {
  if (!raw.startsWith("{")) {
    return null
  }
  const parsed = writeClaimSchema.safeParse(JSON.parse(raw))
  return parsed.success ? parsed.data : null
}

export async function claimHeavyStepResume(input: {
  outcomeKey: string
  resumeLeaseToken: string
}): Promise<"claimed" | "pending" | "resumed"> {
  return String(
    await getRedisConnection("hot").eval(
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
  obj["outputValues"] = nil
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
      RESUME_LEASE_MS.toString(),
    ),
  ) as "claimed" | "pending" | "resumed"
}

export async function finishHeavyStepResume(input: {
  outcomeKey: string
  resumeLeaseToken: string
  succeeded: boolean
}): Promise<void> {
  await getRedisConnection("hot").eval(
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

export type HeavyStepAttempt =
  | { action: "run" }
  | { action: "replay"; outputValues: HeavyStepOutputValue[] }
  | { action: "skip" }

/**
 * A stale `writing` outcome means a previous attempt died between claiming
 * the write and finishing it (e.g. the second field write threw). The retry
 * replays the values stored at claim time: running the provider again would
 * bill twice and, when the output field is also the input field, read back a
 * half-written value. A stale record without stored values predates replay
 * and waits for the fallback deadline. Same staleness rule as
 * `transitionOutcome`.
 */
export async function resolveHeavyStepAttempt(
  outcomeKey: string,
): Promise<HeavyStepAttempt> {
  const outcome = await readOutcome(outcomeKey)
  if (outcome?.status === "pending") {
    return { action: "run" }
  }
  const isStaleWrite =
    outcome?.status === "writing" &&
    (outcome.writingStartedAt === undefined ||
      Date.now() - outcome.writingStartedAt > STALE_WRITE_MS)
  if (isStaleWrite && outcome.outputValues) {
    return { action: "replay", outputValues: outcome.outputValues }
  }
  return { action: "skip" }
}

export async function completeHeavyStep(input: {
  contactId: string
  contactInboxId: string
  outcomeKey: string
  result: HeavyStepResultData
  workspaceId: string
}): Promise<void> {
  if (input.result.status === "error") {
    await transitionOutcome(input.outcomeKey, "failed", {
      errorMessage: input.result.errorMessage,
    })
    return
  }
  if (input.result.status === "skip") {
    await transitionOutcome(input.outcomeKey, "succeeded", {
      resultStatus: "skip",
    })
    return
  }
  const claim = parseWriteClaim(
    await transitionOutcome(input.outcomeKey, "writing", {
      outputValues: input.result.outputValues,
    }),
  )
  if (!claim) {
    return
  }
  // Values are stored at claim time; a retry after a partial write only
  // rewrites those stored values.
  const outputValues = claim.outputValues ?? input.result.outputValues
  for (const output of outputValues) {
    await saveResultToCustomField({
      contactId: input.contactId,
      contactInboxId: input.contactInboxId,
      customFieldId: output.customFieldId,
      fullText: output.value,
      workspaceId: input.workspaceId,
    })
  }
  await transitionOutcome(input.outcomeKey, "succeeded", {
    resultStatus: "success",
  })
}

export async function failHeavyStep(
  outcomeKey: string,
  error: unknown,
): Promise<void> {
  await transitionOutcome(outcomeKey, "failed", {
    errorMessage: normalizeError(error).message,
  })
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
    sentByUserId: props.sentByUserId,
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
  props: HeavyStepProps<HeavyStepRunnerStep>,
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
  props: HeavyStepProps<HeavyStepRunnerStep>,
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
    getHeavyStepAttemptBudgetMs(
      action,
      "provider" in props.step ? props.step.provider : undefined,
    ),
  )
  const outcome = await ensurePending(outcomeKey, completionWaitTimeoutMs)
  if (outcome.status === "succeeded") {
    return { result: null, status: outcome.resultStatus ?? "success" }
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
      jobId: `heavy-resume-fallback-${buildHeavyStepIdentityHash(identity)}`,
    },
  )
  return { result: null, status: "wait" }
}
