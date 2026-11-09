import {
  contactCustomFieldService,
  contactInboxService,
  conversationService,
  resolveTenantSettings,
} from "@chatbotx.io/business"
import {
  type ReplyValidationResult,
  validateReplyInput,
} from "@chatbotx.io/business/get-user-data"
import { getPublicFileUrl } from "@chatbotx.io/business/utils"
import {
  ensureAttachmentStored,
  MediaNotReadyError,
} from "@chatbotx.io/channel-registry/media-hydration"
import { isMessageStorageError } from "@chatbotx.io/database/errors"
import {
  createMessageRepository,
  getSafeSinceTime,
} from "@chatbotx.io/database/repositories"
import {
  GET_USER_DATA_WEBVIEW_SELECTION_PAYLOAD_TYPE,
  type GetUserDataStepSchema,
  type GetUserDataWebviewSelectionPayload,
  type InputFailureReason,
  inputFailureReasons,
  ReplyFormat,
  type StepInputResolutionReason,
  stepInputResolutionReasons,
} from "@chatbotx.io/flow-config"
import { IntegrationException } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { add, isBefore } from "date-fns"
import { logger } from "../../../lib/logger"
import type { ExecuteStepProps } from "../flow"
import { TRIGGER_MESSAGE_LOOKBACK_MS } from "../shared/trigger-message"
import type { ExecuteStepResult } from "../step"

import {
  advanceChallengeAttempt,
  armInputTimeout,
  clearChallengeOwnedByRun,
  readChallengeAttempts,
  readPendingStepChallenge,
  readRunChallengeId,
  settleChallenge,
  toValidDate,
  writeChallenge,
} from "./challenge-cycle"
import { hasSkipButton, sendPrompt, sendTextPrompt } from "./prompt"

export async function getUserData(
  props: ExecuteStepProps<GetUserDataStepSchema>,
): Promise<ExecuteStepResult> {
  const webviewSelection = readWebviewSelection(props)
  const resolutionReason = readInputResolutionReason(props)
  const isAnswer = Boolean(props.ctx?.variables.conversation.challengeAttempts)

  // The first prompt owns the cycle it creates, so it handles its own failures.
  if (!(webviewSelection || resolutionReason || isAnswer)) {
    return await firstSendMessage(props)
  }

  try {
    if (webviewSelection) {
      return await handleWebviewSelection(props, webviewSelection)
    }
    if (resolutionReason) {
      return await handleInputResolution(props, resolutionReason)
    }
    return await handleSkipOrError(props)
  } catch (error) {
    return await failStep(props, error, readRunChallengeId(props))
  }
}

/** A date/datetime picker submission addressed to this step, if the run carries one. */
function readWebviewSelection(
  props: ExecuteStepProps<GetUserDataStepSchema>,
): GetUserDataWebviewSelectionPayload | undefined {
  const { metadata, step } = props
  if (
    metadata?.type === GET_USER_DATA_WEBVIEW_SELECTION_PAYLOAD_TYPE &&
    metadata.stepId === step.id
  ) {
    return metadata
  }
  return
}

/**
 * Fails the step after an unexpected error. A run that owns a challenge cycle
 * may only clear that cycle's challenge: if a timeout, Skip tap or reply
 * already settled it (or another step took over), this run lost and must
 * neither erase the newer challenge nor continue the flow a second time. A
 * failing cleanup throws, so the job retries with the challenge intact.
 */
async function failStep(
  props: ExecuteStepProps<GetUserDataStepSchema>,
  error: unknown,
  ownedChallengeId: string | undefined,
): Promise<ExecuteStepResult> {
  logger.error({ err: error }, "getUserData: error")
  // Transient: let the job retry with the challenge intact.
  if (isMessageStorageError(error) || error instanceof MediaNotReadyError) {
    throw error
  }

  if (!(await clearChallengeOwnedByRun(props, ownedChallengeId))) {
    return { result: undefined, status: "wait" }
  }

  const errorMessage = error instanceof Error ? error.message : String(error)
  return { result: undefined, status: "error", errorMessage }
}

async function firstSendMessage(
  props: ExecuteStepProps<GetUserDataStepSchema>,
): Promise<ExecuteStepResult> {
  const { step } = props

  // Reuse the challengeId of this step's pending challenge so a webview link
  // opened from an earlier prompt stays valid. A brand-new cycle gets a fresh
  // id and its own deadline origin.
  const pendingChallenge = readPendingStepChallenge(props)
  const challengeId =
    pendingChallenge?.data.stepId === step.id
      ? (pendingChallenge.data.challengeId ?? createId())
      : createId()
  const startedAt = new Date()

  // Unset until the challenge is written: a failed write has no cycle to own.
  let ownedChallengeId: string | undefined
  try {
    await writeChallenge(props, { attempts: 1, challengeId, startedAt })
    ownedChallengeId = challengeId
    // Armed after the challenge exists: a short deadline can fire before the
    // prompt is even sent, and a timer with no challenge to claim does nothing.
    if (step.autoSkip) {
      await armInputTimeout(props, { challengeId, startedAt })
    }
    await sendPrompt(props, challengeId)
  } catch (error) {
    // The timer may already have settled this cycle while the prompt was
    // sending, so a failure only clears the challenge this run created.
    return await failStep(props, error, ownedChallengeId)
  }

  return { result: undefined, status: "wait" }
}

/**
 * Handles a submission from the date/datetime webview picker (RF09/RF10).
 * The claim names the token's own challenge, so a duplicate submit (double
 * tap, retried resume job) or a stale token from an earlier cycle is a no-op
 * instead of applying the success branch twice. See `settleChallenge` for the
 * claim-first ordering and its restore on failure.
 */
async function handleWebviewSelection(
  props: ExecuteStepProps<GetUserDataStepSchema>,
  metadata: GetUserDataWebviewSelectionPayload,
): Promise<ExecuteStepResult> {
  const { conversation, step } = props

  const lostOrFailed = await settleChallenge(
    props,
    async () => {
      await recordLastInputFailure(props, null)
      if (step.outputFieldId) {
        await contactCustomFieldService.setValueByKey({
          workspaceId: conversation.workspaceId,
          contactId: conversation.contactId,
          keyword: step.outputFieldId,
          value: metadata.selectedValue,
          allowBotFields: true,
          touchUnchanged: step.replyFormat === ReplyFormat.location,
        })
      }
    },
    {
      challengeId: metadata.challengeId,
      claim: () =>
        conversationService.consumeChallenge({
          workspaceId: conversation.workspaceId,
          conversationId: conversation.id,
          stepId: step.id,
          challengeId: metadata.challengeId,
        }),
    },
  )

  return lostOrFailed ?? { result: metadata.selectedValue, status: "success" }
}

async function handleSkipOrError(
  props: ExecuteStepProps<GetUserDataStepSchema>,
): Promise<ExecuteStepResult> {
  const { step, ctx } = props
  const validUserData = await validateUserData(props)

  if (!ctx?.variables.conversation.challengeAttempts) {
    throw new IntegrationException(
      `getUserData: state is not present for conversation ${props.conversation.id}`,
    )
  }

  // if user data is valid, save to custom field if configured
  if (validUserData.ok) {
    // Claim first: a reply that lost to a webview submit, a Skip tap or the
    // timeout must not write the contact's field or clear `lastInputFailure`.
    const lostOrFailed = await settleChallenge(props, async () => {
      await recordLastInputFailure(props, null)

      if (step.outputFieldId) {
        const value = await resolveOutputValue(props, validUserData)
        await contactCustomFieldService.setValueByKey({
          workspaceId: props.conversation.workspaceId,
          contactId: props.conversation.contactId,
          keyword: step.outputFieldId,
          value,
          allowBotFields: true,
          // A re-shared identical location must still rank as the newest one
          // for Find places near me, which orders location fields by updatedAt.
          touchUnchanged: step.replyFormat === ReplyFormat.location,
        })
      }
    })

    return (
      lostOrFailed ?? { result: validUserData.userInput, status: "success" }
    )
  }

  const autoSkipReason = step.autoSkip ? findAutoSkipReason(props) : undefined
  if (autoSkipReason) {
    const lostOrFailed = await settleChallenge(props, () =>
      recordLastInputFailure(props, autoSkipReason),
    )
    return lostOrFailed ?? { result: undefined, status: "skip" }
  }

  // if user data is invalid, retry
  logger.info(
    {
      conversationId: props.conversation.id,
      reason: validUserData.errorMessage ?? "getUserData: invalid user data",
    },
    "getUserData: input rejected, retrying",
  )

  return await sendRetryPrompt(props)
}

/**
 * Whether a resolution reason still applies to the step as it is configured
 * now. The flow may have been edited since the timer or Skip button was
 * issued, so the step re-checks instead of trusting the request.
 */
const INPUT_RESOLUTION_ENABLED: Record<
  StepInputResolutionReason,
  (step: GetUserDataStepSchema) => boolean
> = {
  [inputFailureReasons.timeout]: (step) => step.autoSkip,
  [inputFailureReasons.userSkipped]: (step) => hasSkipButton(step),
}

/**
 * The step's input ends without a typed answer: the timer ran out or the
 * contact tapped Skip. Takes the Skip branch, like an auto skip.
 */
async function handleInputResolution(
  props: ExecuteStepProps<GetUserDataStepSchema>,
  reason: StepInputResolutionReason,
): Promise<ExecuteStepResult> {
  const { conversation, step } = props

  if (!INPUT_RESOLUTION_ENABLED[reason](step)) {
    logger.info(
      { conversationId: conversation.id, stepId: step.id, reason },
      "getUserData: input resolution is not enabled on the step, ignoring",
    )
    return { result: undefined, status: "wait" }
  }

  const lostOrFailed = await settleChallenge(props, () =>
    INPUT_RESOLUTION_RECORD_IS_BEST_EFFORT[reason]
      ? recordLastInputFailureBestEffort(props, reason)
      : recordLastInputFailure(props, reason),
  )

  return lostOrFailed ?? { result: undefined, status: "skip" }
}

/**
 * Whether failing to record the reason may still let the step take its Skip
 * branch. A timeout has no contact to try again, so restoring the challenge
 * after a failed record would strand a silent contact with no timer left; a
 * Skip tap can simply be tapped again, so it restores instead.
 */
const INPUT_RESOLUTION_RECORD_IS_BEST_EFFORT: Record<
  StepInputResolutionReason,
  boolean
> = {
  [inputFailureReasons.timeout]: true,
  [inputFailureReasons.userSkipped]: false,
}

async function recordLastInputFailureBestEffort(
  props: ExecuteStepProps<GetUserDataStepSchema>,
  reason: InputFailureReason,
): Promise<void> {
  try {
    await recordLastInputFailure(props, reason)
  } catch (error) {
    logger.warn(
      {
        err: error,
        conversationId: props.conversation.id,
        stepId: props.step.id,
        reason,
      },
      "getUserData: could not record the input failure, taking the Skip branch anyway",
    )
  }
}

/**
 * The resolution (if any) the worker asked this run to apply. It rides on the
 * run's variables rather than its metadata: metadata propagates to every
 * continuation and would re-resolve the step if the flow loops back to it.
 * The variable names the pending challenge's step, so another step of the same
 * run never consumes it.
 */
function readInputResolutionReason(
  props: ExecuteStepProps<GetUserDataStepSchema>,
): StepInputResolutionReason | undefined {
  const parsed = stepInputResolutionReasons.safeParse(
    props.ctx?.variables.conversation.challengeResolution?.value,
  )
  if (!parsed.success) {
    return
  }
  return readPendingStepChallenge(props)?.data.stepId === props.step.id
    ? parsed.data
    : undefined
}

async function recordLastInputFailure(
  props: ExecuteStepProps<GetUserDataStepSchema>,
  reason: InputFailureReason | null,
): Promise<void> {
  await contactInboxService.updateTracking({
    contactInboxId: props.contactInbox.id,
    contactId: props.contactInbox.contactId,
    workspaceId: props.conversation.workspaceId,
    data: { lastInputFailure: reason },
  })
}

type MessageRepository = Awaited<ReturnType<typeof createMessageRepository>>

/**
 * The contact message this run answers. When the job names the message that
 * triggered it, that message is judged on its own, so an answer queued before a
 * later message (a Skip tap, whose label is now the latest incoming text) is
 * never read as that later message. Without a trigger, or when it cannot be
 * found, it is the latest incoming message, as it always was.
 */
async function findAnsweredMessage(
  props: ExecuteStepProps<GetUserDataStepSchema>,
  messageRepository: MessageRepository,
) {
  const { conversation, triggerMessageId, triggerMessageCreatedAt } = props

  if (triggerMessageId && triggerMessageCreatedAt) {
    const triggerMessage = await messageRepository.findTriggerMessage({
      id: triggerMessageId,
      conversationId: conversation.id,
      workspaceId: conversation.workspaceId,
      sinceTime:
        getSafeSinceTime(
          triggerMessageCreatedAt,
          TRIGGER_MESSAGE_LOOKBACK_MS,
        ) ?? new Date(0),
      requireCompleteResults: true,
    })
    if (triggerMessage) {
      return triggerMessage
    }
  }

  const lastMessages = await messageRepository.findLastByConversation(
    conversation.id,
    {
      messageTypes: ["incoming"],
      limit: 1,
      requireCompleteResults: true,
      withAttachments: true,
      // Anchor on this conversation's own lastActivityAt, not the
      // ContactInbox's lastMessageAt — a contact's ContactInbox is shared
      // across their DM and every comment-thread conversation, so its
      // lastMessageAt can reflect a different, more recently active
      // conversation and push sinceTime past this conversation's real last
      // incoming message, causing the sharded scan to miss it.
      sinceTime: getSafeSinceTime(
        conversation.lastActivityAt ?? conversation.createdAt,
        365 * 24 * 60 * 60 * 1000, // 1 year
      ),
      workspaceId: conversation.workspaceId,
    },
  )
  return lastMessages[0]
}

async function validateUserData(
  props: ExecuteStepProps<GetUserDataStepSchema>,
): Promise<ReplyValidationResult> {
  const messageRepository = await createMessageRepository()
  const lastUserMessage = await findAnsweredMessage(props, messageRepository)

  if (!lastUserMessage) {
    return {
      ok: false,
      errorMessage: `getUserData: unable to find last message of conversation ${props.conversation.id}`,
    }
  }

  const validated = validateReplyInput(props.step.replyFormat, lastUserMessage)
  if (!(validated.ok && validated.attachment)) {
    return validated
  }

  // A lazily-ingested attachment is still a provider URL that expires: store
  // it first so the saved value (and the step result) is a durable object.
  // A `MediaNotReadyError` propagates — the chat job is retried.
  const stored = await ensureAttachmentStored({
    attachmentId: validated.attachment.id,
    workspaceId: props.conversation.workspaceId,
    messageCreatedAt: validated.attachment.messageCreatedAt,
    originPath: validated.userInput,
  })
  if (!stored) {
    return {
      ok: false,
      errorMessage: "getUserData: attachment is no longer available",
    }
  }

  return { ...validated, userInput: stored.originPath }
}

// Attachments validate to a bare storage key; turn it into a public URL (with
// the tenant's storage domain) so the stored value is usable downstream. Text
// and location values are stored verbatim.
async function resolveOutputValue(
  props: ExecuteStepProps<GetUserDataStepSchema>,
  result: Extract<ReplyValidationResult, { ok: true }>,
): Promise<string> {
  if (result.kind !== "attachment") {
    return result.userInput
  }

  const { storageUrl } = await resolveTenantSettings({
    workspaceId: props.conversation.workspaceId,
  })

  return getPublicFileUrl(result.userInput, storageUrl)
}

/**
 * Invalid reply: the retry message (if any), then the question again with its
 * Skip button. A send failing after the attempt advanced fails the step
 * through the outer catch, which clears the challenge — no half-advanced
 * attempt survives.
 */
async function sendRetryPrompt(
  props: ExecuteStepProps<GetUserDataStepSchema>,
): Promise<ExecuteStepResult> {
  const { conversation, step } = props

  const challengeId = await advanceChallengeAttempt(
    props,
    readChallengeAttempts(props),
  )
  if (!challengeId) {
    logger.info(
      { conversationId: conversation.id, stepId: step.id },
      "getUserData: a concurrent reply already advanced the attempt, not retrying",
    )
    return { result: undefined, status: "wait" }
  }

  const retryMessage = step.retryMessage.trim()
  if (retryMessage) {
    await sendTextPrompt(props, retryMessage, [])
  }
  await sendPrompt(props, challengeId)

  return { result: undefined, status: "retry" }
}

/**
 * Why a rejected reply ends the step instead of retrying: its deadline passed,
 * or it used its last attempt. Undefined means retry.
 */
function findAutoSkipReason(
  props: ExecuteStepProps<GetUserDataStepSchema>,
): InputFailureReason | undefined {
  const { step } = props
  const conversationVariables = props.ctx?.variables.conversation
  // The deadline counts from the first prompt; challenges written before
  // `startedAt` existed fall back to the last attempt, as they always did.
  const deadlineOrigin =
    toValidDate(conversationVariables?.challengeStartedAt?.value) ??
    toValidDate(conversationVariables?.challengeLastAttemptAt?.value) ??
    new Date()
  const deadline = add(deadlineOrigin, {
    [step.autoSkipTimeUnit]: step.autoSkipTimeValue,
  })

  if (isBefore(deadline, new Date())) {
    return inputFailureReasons.timeout
  }
  if (readChallengeAttempts(props) >= step.autoSkipFailAttempts) {
    return inputFailureReasons.invalidInputAttempts
  }
  return
}
