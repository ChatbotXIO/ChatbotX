import { conversationService } from "@chatbotx.io/business"
import {
  type ConversationAttributes,
  type ConversationStepChallenge,
  smartDelayTypes,
} from "@chatbotx.io/database/partials"
import {
  type GetUserDataStepSchema,
  inputFailureReasons,
  STEP_INPUT_RESOLUTION_PAYLOAD_TYPE,
} from "@chatbotx.io/flow-config"
import { IntegrationException } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { add } from "date-fns"
import { logger } from "../../../lib/logger"
import type { ExecuteStepProps } from "../flow"
import { scheduleSmartDelayResume } from "../smart-delay"
import type { ExecuteStepResult } from "../step"

/**
 * Resolves the flow node the challenge should point back at, mirroring
 * `sendMessage`'s own check — a missing target node means the flow step
 * cannot be resumed at all, so both call sites fail the same way.
 */
export function resolveChallengeNodeId(
  props: ExecuteStepProps<GetUserDataStepSchema>,
): string {
  const nodeId = props.targetId
  if (!nodeId) {
    throw new IntegrationException(
      `getUserData: missing target node for conversation ${props.conversation.id}`,
    )
  }
  return nodeId
}

export function resolveChallengeFlowVersionId(
  props: ExecuteStepProps<GetUserDataStepSchema>,
): string | undefined {
  return props.useLatestFlowVersion ? undefined : props.flowVersion.id
}

/**
 * Best-effort recovery after a post-claim side effect failed: puts the
 * consumed challenge back, with its attempts and deadline origin intact, so
 * the contact can retry instead of being stranded. The restore is conditional
 * (`restoreChallengeIfAbsent`) — if another challenge cycle started between
 * the claim and this restore, that newer challenge wins and the restore is
 * skipped. Failure here is logged and swallowed. Returns whether the
 * challenge is pending again.
 */
async function restoreChallengeAfterFailedClaim(
  props: ExecuteStepProps<GetUserDataStepSchema>,
  challengeId: string | undefined,
): Promise<boolean> {
  const { conversation, step } = props

  try {
    const pendingChallenge = readPendingStepChallenge(props)
    const challenge: ConversationStepChallenge =
      pendingChallenge?.data.stepId === step.id &&
      pendingChallenge.data.challengeId === challengeId
        ? pendingChallenge
        : {
            type: "step",
            data: {
              flowId: props.flowVersion.flowId,
              flowVersionId: resolveChallengeFlowVersionId(props),
              nodeId: resolveChallengeNodeId(props),
              stepId: step.id,
              attempts: 1,
              lastAttemptAt: new Date(),
              appointmentId: props.appointmentId,
              challengeId,
            },
          }

    const restored = await conversationService.restoreChallengeIfAbsent({
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      challenge,
    })

    logger.info(
      {
        conversationId: conversation.id,
        stepId: step.id,
        challengeId,
        restored,
      },
      restored
        ? "getUserData: restored challenge after a side-effect failure so the contact can retry"
        : "getUserData: skipped challenge restore, a newer challenge already exists",
    )
    if (restored) {
      await rearmRestoredTimeout(props, challenge)
    }
    return restored
  } catch (restoreError) {
    logger.warn(
      { err: restoreError, conversationId: conversation.id, stepId: step.id },
      "getUserData: failed to restore challenge after a side-effect failure",
    )
    return false
  }
}

/**
 * The timer of a restored challenge may have fired (and stood down) while the
 * challenge was claimed, which would leave a silent contact waiting forever.
 * Re-arms it on the original deadline; a deadline already past fires at once.
 * Best effort: the contact can still answer without it.
 */
async function rearmRestoredTimeout(
  props: ExecuteStepProps<GetUserDataStepSchema>,
  challenge: ConversationStepChallenge,
): Promise<void> {
  const { challengeId } = challenge.data
  const startedAt = toValidDate(challenge.data.startedAt)
  if (!(props.step.autoSkip && challengeId && startedAt)) {
    return
  }

  try {
    await armInputTimeout(props, { challengeId, startedAt })
  } catch (error) {
    logger.warn(
      { err: error, conversationId: props.conversation.id, challengeId },
      "getUserData: could not re-arm the timeout of a restored challenge",
    )
  }
}

/** A date read back from a challenge or a variable (JSON stores it as a string). */
export function toValidDate(value: unknown): Date | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date
  }
}

export async function writeChallenge(
  props: ExecuteStepProps<GetUserDataStepSchema>,
  data: { attempts: number; challengeId: string; startedAt?: Date },
): Promise<void> {
  const { conversation, flowVersion, step } = props

  await conversationService.updateChallenge({
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    challenge: {
      type: "step",
      data: {
        flowId: flowVersion.flowId,
        flowVersionId: resolveChallengeFlowVersionId(props),
        nodeId: resolveChallengeNodeId(props),
        stepId: step.id,
        attempts: data.attempts,
        lastAttemptAt: new Date(),
        startedAt: data.startedAt,
        appointmentId: props.appointmentId,
        challengeId: data.challengeId,
      },
    },
  })
}

/**
 * Schedules the step's timeout from the first prompt, so a contact who never
 * answers still takes the Skip branch. One pending timer per conversation:
 * re-asking replaces it.
 */
export async function armInputTimeout(
  props: ExecuteStepProps<GetUserDataStepSchema>,
  challenge: { challengeId: string; startedAt: Date },
): Promise<void> {
  const { conversation, contactInbox, flowVersion, step } = props

  await scheduleSmartDelayResume({
    type: smartDelayTypes.enum.stepInputTimeout,
    triggerAt: add(challenge.startedAt, {
      [step.autoSkipTimeUnit]: step.autoSkipTimeValue,
    }),
    workspaceId: conversation.workspaceId,
    flowId: flowVersion.flowId,
    flowVersionId: resolveChallengeFlowVersionId(props) ?? null,
    conversationId: conversation.id,
    contactInboxId: contactInbox.id,
    nodeId: resolveChallengeNodeId(props),
    stepId: step.id,
    metadata: {
      type: STEP_INPUT_RESOLUTION_PAYLOAD_TYPE,
      stepId: step.id,
      challengeId: challenge.challengeId,
      reason: inputFailureReasons.timeout,
    },
    appointmentId: props.appointmentId,
  })
}

/**
 * Moves the challenge to its next attempt. Of two concurrent invalid replies
 * exactly one wins and gets the challenge id back, so only one sends the retry
 * prompt; the loser gets undefined.
 */
export async function advanceChallengeAttempt(
  props: ExecuteStepProps<GetUserDataStepSchema>,
  fromAttempts: number,
): Promise<string | undefined> {
  const { conversation, step } = props
  const pendingChallenge = readPendingStepChallenge(props)

  // The run's attempt counter comes from the job's snapshot of the challenge,
  // while the conversation was loaded fresh. No challenge for this step here
  // means a timeout, Skip tap or webview submit already settled it (or another
  // step took over), so this reply lost the race and must not revive it.
  if (
    pendingChallenge?.data.stepId !== step.id ||
    !isRunForPendingCycle(props, pendingChallenge)
  ) {
    return
  }

  const pendingChallengeId = pendingChallenge.data.challengeId
  if (pendingChallengeId) {
    const advanced = await conversationService.advanceStepChallengeAttempt({
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      stepId: step.id,
      challengeId: pendingChallengeId,
      fromAttempts,
      toAttempts: fromAttempts + 1,
      lastAttemptAt: new Date(),
    })
    return advanced ? pendingChallengeId : undefined
  }

  // A challenge written before ids existed cannot be claimed atomically, so it
  // is upgraded in place with an unconditional write, as it always was.
  const challengeId = createId()
  await writeChallenge(props, { attempts: fromAttempts + 1, challengeId })
  return challengeId
}

async function clearChallenge(props: {
  workspaceId: string
  conversationId: string
}): Promise<void> {
  await conversationService.updateChallenge({
    workspaceId: props.workspaceId,
    conversationId: props.conversationId,
    challenge: undefined,
  })
}

/**
 * Atomically claims the conversation's *current* challenge for a run that
 * answers it (typed reply, auto skip, Skip tap or timeout), so only one
 * outcome ever reports a terminal status. See
 * `.agents/skills/reliability-concurrency`.
 *
 * - No challenge present at all → someone already consumed it; the caller
 *   lost the race.
 * - Challenge present but written before `challengeId` existed (legacy
 *   in-flight rows) → no atomic claim is possible, so this falls back to the
 *   pre-existing unconditional clear and always reports a win, preserving
 *   old behavior for those rows. That fallback cannot race a webview submit:
 *   only challenges written WITH a challengeId ever issued a webview token,
 *   so no webview submission can exist for a legacy row.
 * - Challenge present with a `challengeId` → atomic compare-and-clear via
 *   `consumeChallenge`.
 */
async function consumeCurrentChallenge(
  props: ExecuteStepProps<GetUserDataStepSchema>,
): Promise<boolean> {
  const { conversation, step } = props
  const currentChallenge = readPendingStepChallenge(props)

  // A challenge of another step (e.g. a questionnaire's, which has no id) must
  // never be cleared on this step's behalf: the run's snapshot is stale.
  if (
    currentChallenge?.data.stepId !== step.id ||
    !isRunForPendingCycle(props, currentChallenge)
  ) {
    return false
  }

  const challengeId = currentChallenge.data.challengeId
  if (!challengeId) {
    await clearChallenge({
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
    })
    return true
  }

  return await conversationService.consumeChallenge({
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    stepId: step.id,
    challengeId,
  })
}

/**
 * The challenge id this run belongs to: the job's snapshot of the challenge it
 * was queued for. Absent for challenges written before ids existed.
 */
export function readRunChallengeId(
  props: ExecuteStepProps<GetUserDataStepSchema>,
): string | undefined {
  const value = props.ctx?.variables.conversation.challengeId?.value
  return typeof value === "string" ? value : undefined
}

/**
 * Whether the pending challenge is the cycle this run was queued for. The
 * conversation is loaded fresh, so if the cycle ended and the flow came back to
 * the same step meanwhile, the pending challenge is a NEWER cycle and this run
 * (an older reply, tap or timer) must not advance or consume it.
 */
function isRunForPendingCycle(
  props: ExecuteStepProps<GetUserDataStepSchema>,
  pendingChallenge: ConversationStepChallenge,
): boolean {
  const runChallengeId = readRunChallengeId(props)
  return (
    runChallengeId === undefined ||
    runChallengeId === pendingChallenge.data.challengeId
  )
}

/**
 * Failure cleanup for a run that owns a challenge cycle: clears only that
 * cycle's challenge, through the same atomic claim every outcome uses. Returns
 * false when the cycle was already settled or replaced, so the caller must not
 * report an error or let the flow continue. Throws when the claim itself
 * fails. A run that owns no known cycle (it failed before writing one, or a
 * legacy challenge) keeps the unconditional clear it always had.
 */
export async function clearChallengeOwnedByRun(
  props: ExecuteStepProps<GetUserDataStepSchema>,
  ownedChallengeId: string | undefined,
): Promise<boolean> {
  const { conversation, step } = props

  if (!ownedChallengeId) {
    await clearChallengeSafely({
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
    })
    return true
  }

  try {
    const cleared = await conversationService.consumeChallenge({
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      stepId: step.id,
      challengeId: ownedChallengeId,
    })
    if (!cleared) {
      logger.info(
        { conversationId: conversation.id, stepId: step.id },
        "getUserData: the challenge was already settled or replaced, not reporting the failure",
      )
    }
    return cleared
  } catch (error) {
    // Ownership is unknown: the cycle may still be pending and be settled by a
    // timeout or Skip. Reporting an error here would let the flow continue as
    // well, so fail the job instead and let it retry (like other transient
    // failures), with the challenge intact.
    logger.warn(
      { err: error, conversationId: conversation.id, stepId: step.id },
      "getUserData: failed to clear challenge after terminal error, retrying the job",
    )
    throw error
  }
}

/** The step challenge pending on the conversation this run loaded, if any. */
export function readPendingStepChallenge(
  props: ExecuteStepProps<GetUserDataStepSchema>,
): ConversationStepChallenge | undefined {
  const challenge = (
    props.conversation.additionalAttributes as
      | ConversationAttributes
      | undefined
  )?.challenge
  return challenge?.type === "step" ? challenge : undefined
}

/** How an outcome claims its challenge, and which challenge a failed outcome restores. */
type ChallengeClaim = {
  challengeId: string | undefined
  claim: () => Promise<boolean>
}

/** The claim of a run answering the conversation's pending challenge. */
function claimPendingChallenge(
  props: ExecuteStepProps<GetUserDataStepSchema>,
): ChallengeClaim {
  return {
    challengeId: readPendingStepChallenge(props)?.data.challengeId,
    claim: () => consumeCurrentChallenge(props),
  }
}

/**
 * Claims the challenge first, then applies the side effects, so only the one
 * outcome that won the claim (typed reply, webview, Skip, timeout) ever writes
 * anything. Returns undefined when this caller won and the side effects
 * landed. Otherwise returns the result to report:
 * - `wait` when it lost the claim, or when a side effect failed and the
 *   challenge was put back (the contact can answer again, so the flow must not
 *   move past the step);
 * - `error` when a side effect failed and the challenge could not be put back.
 *
 * A hard crash between the claim and the restore still loses the outcome;
 * closing that two-await window would need a transactional outbox.
 */
export async function settleChallenge(
  props: ExecuteStepProps<GetUserDataStepSchema>,
  applySideEffects: () => Promise<void>,
  challengeClaim: ChallengeClaim = claimPendingChallenge(props),
): Promise<ExecuteStepResult | undefined> {
  const { conversation, step } = props

  const claimed = await challengeClaim.claim()
  if (!claimed) {
    logger.info(
      {
        conversationId: conversation.id,
        stepId: step.id,
        challengeId: challengeClaim.challengeId,
      },
      "getUserData: challenge already settled or replaced, not completing",
    )
    return { result: undefined, status: "wait" }
  }

  try {
    await applySideEffects()
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(
      { err: error, conversationId: conversation.id, stepId: step.id },
      "getUserData: side effect failed after claiming the challenge",
    )
    const restored = await restoreChallengeAfterFailedClaim(
      props,
      challengeClaim.challengeId,
    )
    if (restored) {
      return { result: undefined, status: "wait" }
    }
    return { result: undefined, status: "error", errorMessage }
  }
}

async function clearChallengeSafely(props: {
  workspaceId: string
  conversationId: string
}): Promise<void> {
  try {
    await clearChallenge(props)
  } catch (error) {
    logger.warn(
      { err: error, conversationId: props.conversationId },
      "getUserData: failed to clear challenge after terminal error",
    )
  }
}

/** The attempt counter of the challenge this run answers (1 when absent). */
export function readChallengeAttempts(
  props: ExecuteStepProps<GetUserDataStepSchema>,
): number {
  const value = props.ctx?.variables.conversation.challengeAttempts?.value
  return typeof value === "number" ? value : 1
}
