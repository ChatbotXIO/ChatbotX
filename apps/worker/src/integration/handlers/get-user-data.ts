import {
  contactCustomFieldService,
  contactInboxService,
  conversationService,
  normalizeLanguage,
  resolveTenantSettings,
  workspaceService,
} from "@chatbotx.io/business"
import {
  type ReplyValidationResult,
  validateReplyInput,
} from "@chatbotx.io/business/get-user-data"
import { getPublicFileUrl } from "@chatbotx.io/business/utils"
import { isMessageStorageError } from "@chatbotx.io/database/errors"
import type { ConversationAttributes } from "@chatbotx.io/database/partials"
import {
  createMessageRepository,
  getSafeSinceTime,
} from "@chatbotx.io/database/repositories"
import { signUserDataWebviewToken } from "@chatbotx.io/encryption"
import {
  GET_USER_DATA_WEBVIEW_SELECTION_PAYLOAD_TYPE,
  type GetUserDataStepSchema,
  type GetUserDataWebviewSelectionPayload,
  type InputFailureReason,
  inputFailureReasons,
  ReplyFormat,
  type SendTextStepSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import {
  IntegrationException,
  URL_QUICK_REPLY_CAPABLE_CHANNELS,
  type Variable,
} from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { ChatJobAction, chatQueue } from "@chatbotx.io/worker-config"
import { add, isBefore } from "date-fns"
import { logger } from "../../lib/logger"
import type { ExecuteStepProps } from "./flow"
import { enqueueFlowStepMessage } from "./flow-utils"
import type { ExecuteStepResult } from "./step"

export async function getUserData(
  props: ExecuteStepProps<GetUserDataStepSchema>,
): Promise<ExecuteStepResult> {
  const { ctx, metadata, step } = props
  // if state is present, handle logic on skip or failure
  try {
    if (
      metadata?.type === GET_USER_DATA_WEBVIEW_SELECTION_PAYLOAD_TYPE &&
      metadata.stepId === step.id
    ) {
      return await handleWebviewSelection(props, metadata)
    }

    if (ctx?.variables.conversation.challengeAttempts) {
      return await handleSkipOrError(props)
    }

    return await firstSendMessage(props)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error({ err: error }, "getUserData: error")
    if (isMessageStorageError(error)) {
      throw error
    }

    await clearChallengeSafely({
      workspaceId: props.conversation.workspaceId,
      conversationId: props.conversation.id,
    })

    return { result: undefined, status: "error", errorMessage }
  }
}

async function firstSendMessage(
  props: ExecuteStepProps<GetUserDataStepSchema>,
): Promise<ExecuteStepResult> {
  const { step } = props

  await sendMessage(props, step.message)

  return { result: undefined, status: "wait" }
}

/**
 * Handles a submission from the date/datetime webview picker (RF09/RF10).
 * The challenge is claimed atomically via `consumeChallenge` — a compare-
 * and-clear on stepId + challengeId — so a duplicate submit (double tap,
 * retried resume job) or a stale token from a previous challenge cycle is a
 * safe no-op rather than double-applying the success branch. See
 * `.agents/skills/reliability-concurrency`.
 *
 * Claim-first ordering is deliberate: it prevents a losing concurrent submit
 * from overwriting the winner's custom-field value. That ordering has a
 * failure mode of its own — a side effect can still fail *after* the claim
 * succeeds, which would otherwise strand the contact with a consumed
 * challenge and no way to retry. The try/catch below restores the challenge
 * on that path. Crucially, it then returns an "error" result directly
 * instead of rethrowing: `getUserData`'s outer catch calls
 * `clearChallengeSafely` unconditionally, which would immediately erase the
 * challenge this function just restored. Only this function may decide the
 * restored challenge's fate.
 *
 * Known residual risk: a hard process crash between the claim and the
 * restore still loses the selection (the contact must resubmit after the
 * flow re-prompts). Closing that window would require a transactional
 * outbox; the window is two in-process awaits wide, so it is accepted.
 */
async function handleWebviewSelection(
  props: ExecuteStepProps<GetUserDataStepSchema>,
  metadata: GetUserDataWebviewSelectionPayload,
): Promise<ExecuteStepResult> {
  const { conversation, contactInbox, step } = props

  const claimed = await conversationService.consumeChallenge({
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    stepId: step.id,
    challengeId: metadata.challengeId,
  })

  if (!claimed) {
    logger.info(
      {
        conversationId: conversation.id,
        stepId: step.id,
        challengeId: metadata.challengeId,
      },
      "getUserData: duplicate or stale webview submission, ignoring",
    )
    return { result: undefined, status: "wait" }
  }

  try {
    await contactInboxService.updateTracking({
      contactInboxId: contactInbox.id,
      contactId: contactInbox.contactId,
      workspaceId: conversation.workspaceId,
      data: { lastInputFailure: null },
    })

    if (step.outputFieldId) {
      await contactCustomFieldService.setValueByKey({
        workspaceId: conversation.workspaceId,
        contactId: conversation.contactId,
        keyword: step.outputFieldId,
        value: metadata.selectedValue,
      })
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(
      { err: error, conversationId: conversation.id, stepId: step.id },
      "getUserData: webview side effect failed after claiming the challenge",
    )
    await restoreChallengeAfterFailedClaim(props, metadata)
    return { result: undefined, status: "error", errorMessage }
  }

  return { result: metadata.selectedValue, status: "success" }
}

/**
 * Resolves the flow node the challenge should point back at, mirroring
 * `sendMessage`'s own check — a missing target node means the flow step
 * cannot be resumed at all, so both call sites fail the same way.
 */
function resolveChallengeNodeId(
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

function resolveChallengeFlowVersionId(
  props: ExecuteStepProps<GetUserDataStepSchema>,
): string | undefined {
  return props.useLatestFlowVersion ? undefined : props.flowVersion.id
}

/**
 * Best-effort recovery for `handleWebviewSelection`: re-writes the same
 * challenge (same challengeId) that was just claimed, so the contact can
 * resubmit the webview instead of being stranded. The restore is conditional
 * (`restoreChallengeIfAbsent`) — if another challenge cycle started between
 * the claim and this restore, that newer challenge wins and the restore is
 * skipped. Failure here is logged and swallowed — the caller has already
 * decided to return an "error" result regardless of whether the restore
 * itself succeeds.
 */
async function restoreChallengeAfterFailedClaim(
  props: ExecuteStepProps<GetUserDataStepSchema>,
  metadata: GetUserDataWebviewSelectionPayload,
): Promise<void> {
  const { conversation, step } = props

  try {
    const nodeId = resolveChallengeNodeId(props)
    const flowVersionId = resolveChallengeFlowVersionId(props)

    const restored = await conversationService.restoreChallengeIfAbsent({
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      challenge: {
        type: "step",
        data: {
          flowId: props.flowVersion.flowId,
          flowVersionId,
          nodeId,
          stepId: step.id,
          attempts: 1,
          lastAttemptAt: new Date(),
          appointmentId: props.appointmentId,
          challengeId: metadata.challengeId,
        },
      },
    })

    logger.info(
      {
        conversationId: conversation.id,
        stepId: step.id,
        challengeId: metadata.challengeId,
        restored,
      },
      restored
        ? "getUserData: restored challenge after webview side-effect failure so the contact can retry"
        : "getUserData: skipped challenge restore, a newer challenge already exists",
    )
  } catch (restoreError) {
    logger.warn(
      { err: restoreError, conversationId: conversation.id, stepId: step.id },
      "getUserData: failed to restore challenge after webview side-effect failure",
    )
  }
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
    await contactInboxService.updateTracking({
      contactInboxId: props.contactInbox.id,
      contactId: props.contactInbox.contactId,
      workspaceId: props.conversation.workspaceId,
      data: { lastInputFailure: null },
    })

    if (step.outputFieldId) {
      const value = await resolveOutputValue(props, validUserData)
      await contactCustomFieldService.setValueByKey({
        workspaceId: props.conversation.workspaceId,
        contactId: props.conversation.contactId,
        keyword: step.outputFieldId,
        value,
      })
    }

    // Claim last: a concurrent webview submit racing this manual reply may
    // have already claimed (and cleared) the challenge. The custom-field
    // write above can still land on the loser — that's a deliberate
    // tradeoff, both values are the contact's own input, so a harmless
    // last-write-wins overlap beats losing the terminal result entirely.
    // Only ONE terminator may report success, though, so the claim result
    // alone decides the returned status.
    const claimed = await consumeCurrentChallenge(props)
    if (!claimed) {
      logger.info(
        { conversationId: props.conversation.id, stepId: step.id },
        "getUserData: manual reply lost the challenge claim race, not completing",
      )
      return { result: undefined, status: "wait" }
    }

    return { result: validUserData.userInput, status: "success" }
  }

  // skip if the time to skip is reached
  if (step.autoSkip) {
    const skipResult = checkSkipCondition(step, ctx.variables.conversation)
    if (skipResult.skip) {
      await contactInboxService.updateTracking({
        contactInboxId: props.contactInbox.id,
        contactId: props.contactInbox.contactId,
        workspaceId: props.conversation.workspaceId,
        data: { lastInputFailure: skipResult.reason },
      })

      // Same race as the success branch above: only the winning terminator
      // reports its terminal status.
      const claimed = await consumeCurrentChallenge(props)
      if (!claimed) {
        logger.info(
          { conversationId: props.conversation.id, stepId: step.id },
          "getUserData: autoSkip lost the challenge claim race, not completing",
        )
        return { result: undefined, status: "wait" }
      }

      return { result: undefined, status: "skip" }
    }
  }

  // if user data is invalid, retry
  logger.info(
    {
      conversationId: props.conversation.id,
      reason: validUserData.errorMessage ?? "getUserData: invalid user data",
    },
    "getUserData: input rejected, retrying",
  )

  await sendMessage(
    props,
    resolveRetryPromptText(step),
    ((ctx?.variables.conversation.challengeAttempts?.value as number) ?? 1) + 1,
  )

  return { result: undefined, status: "retry" }
}

/**
 * `retryMessage` defaults to "" (schema has no minimum) and an empty prompt
 * is silently dropped by the send path. For the webview formats
 * (date/datetime) a blank retry falls back to the step's main message so the
 * retry always re-offers the picker button — a silent retry would strand the
 * contact with no way back to the picker. Every other reply format keeps the
 * long-standing behavior (blank retry sends nothing): flows built before
 * this feature may rely on that silence, and typed input still works there.
 */
function resolveRetryPromptText(step: GetUserDataStepSchema): string {
  const isWebviewFormat = Boolean(
    DATE_TIME_WEBVIEW_MODE_BY_REPLY_FORMAT[step.replyFormat],
  )
  return isWebviewFormat
    ? step.retryMessage.trim() || step.message
    : step.retryMessage
}

async function validateUserData(
  props: ExecuteStepProps<GetUserDataStepSchema>,
): Promise<ReplyValidationResult> {
  const messageRepository = await createMessageRepository()
  const lastMessages = await messageRepository.findLastByConversation(
    props.conversation.id,
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
        props.conversation.lastActivityAt ?? props.conversation.createdAt,
        365 * 24 * 60 * 60 * 1000, // 1 year
      ),
      workspaceId: props.conversation.workspaceId,
    },
  )
  const lastUserMessage = lastMessages[0]

  if (!lastUserMessage) {
    return {
      ok: false,
      errorMessage: `getUserData: unable to find last message of conversation ${props.conversation.id}`,
    }
  }

  return validateReplyInput(props.step.replyFormat, lastUserMessage)
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

type DateTimeWebviewMode = "date" | "datetime"

// Maps the free-text replyFormat enum to the two formats that get a webview
// date/datetime picker instead of a plain text prompt (RF09/RF10). Every
// other replyFormat keeps the existing text-prompt behavior unchanged.
const DATE_TIME_WEBVIEW_MODE_BY_REPLY_FORMAT: Partial<
  Record<ReplyFormat, DateTimeWebviewMode>
> = {
  [ReplyFormat.date]: "date",
  [ReplyFormat.datetime]: "datetime",
}

type UserDataWebviewCopy = {
  selectDate: string
}

// Deliberate worker-side i18n exception (no next-intl in the worker runtime):
// mirrors the APPOINTMENT_SCHEDULING_COPY pattern already used by
// appointment-scheduling.ts for the same reason.
const USER_DATA_WEBVIEW_COPY = {
  en: { selectDate: "Select Date" },
  vi: { selectDate: "Chọn ngày" },
} satisfies Record<string, UserDataWebviewCopy>

function getUserDataWebviewCopy(input: {
  language?: string | null
}): UserDataWebviewCopy {
  return normalizeLanguage(input.language) === "vi"
    ? USER_DATA_WEBVIEW_COPY.vi
    : USER_DATA_WEBVIEW_COPY.en
}

async function sendMessage(
  props: ExecuteStepProps<GetUserDataStepSchema>,
  text: string,
  attempts = 1,
) {
  const { conversation, contactInbox, flowVersion, step } = props
  const nodeId = resolveChallengeNodeId(props)
  const flowVersionId = resolveChallengeFlowVersionId(props)

  // Reuse the challengeId across retries within the same challenge cycle so
  // a webview link opened from an earlier prompt (e.g. the first send) stays
  // valid for the retry message's button too. A brand-new challenge cycle
  // (challenge cleared, then a new one started) gets a fresh id.
  const existingChallenge = (
    conversation.additionalAttributes as ConversationAttributes | undefined
  )?.challenge
  const challengeId = existingChallenge?.data.challengeId ?? createId()

  await conversationService.updateChallenge({
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    challenge: {
      type: "step",
      data: {
        flowId: flowVersion.flowId,
        flowVersionId,
        nodeId,
        stepId: step.id,
        attempts,
        lastAttemptAt: new Date(),
        appointmentId: props.appointmentId,
        challengeId,
      },
    },
  })

  // Only offer the webview picker on channels whose outgoing converter
  // actually renders a "url" quick reply as a real link-opening button
  // (see URL_QUICK_REPLY_CAPABLE_CHANNELS). Every other channel falls
  // through to the plain-text prompt below — typed date input still works
  // there, unchanged from before the webview picker existed.
  const webviewMode = DATE_TIME_WEBVIEW_MODE_BY_REPLY_FORMAT[step.replyFormat]
  if (
    webviewMode &&
    URL_QUICK_REPLY_CAPABLE_CHANNELS.has(contactInbox.channel)
  ) {
    await sendDateTimePrompt(props, text, {
      nodeId,
      flowVersionId,
      challengeId,
      mode: webviewMode,
    })
    return
  }

  const promptStep: SendTextStepSchema = {
    id: step.id,
    nodeId,
    stepType: stepTypes.enum.sendText,
    text,
    buttons: [],
  }

  await enqueueFlowStepMessage({
    conversationId: conversation.id,
    contactInboxId: contactInbox.id,
    flowId: flowVersion.flowId,
    flowVersionId,
    step: promptStep,
    metadata: props.metadata,
    ...(props.appointmentId ? { appointmentId: props.appointmentId } : {}),
  })
}

/**
 * Sends the prompt for RF09 (date) / RF10 (datetime) with a URL quick reply
 * that opens the signed webview picker, mirroring appointment-scheduling.ts's
 * booking prompt. Callers must gate on URL_QUICK_REPLY_CAPABLE_CHANNELS —
 * channels outside that set degrade the "url" quick reply into a non-link
 * control (see the constant's doc), so they get the plain-text prompt
 * instead.
 */
async function sendDateTimePrompt(
  props: ExecuteStepProps<GetUserDataStepSchema>,
  text: string,
  context: {
    nodeId: string
    flowVersionId: string | undefined
    challengeId: string
    mode: DateTimeWebviewMode
  },
): Promise<void> {
  const { conversation, contactInbox, flowVersion, step, metadata } = props

  const { appUrl } = await resolveTenantSettings({
    workspaceId: conversation.workspaceId,
  })
  const workspace = await workspaceService.findById({
    id: conversation.workspaceId,
  })
  const copy = getUserDataWebviewCopy({ language: workspace.language })

  const token = await signUserDataWebviewToken({
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    contactInboxId: contactInbox.id,
    contactId: conversation.contactId,
    channel: contactInbox.channel,
    flowId: flowVersion.flowId,
    flowVersionId: context.flowVersionId,
    stepId: step.id,
    nodeId: context.nodeId,
    challengeId: context.challengeId,
    outputFieldId: step.outputFieldId,
    replyFormat: context.mode,
  })

  const pickerUrl = new URL("/extensions/datetime-picker", appUrl)
  pickerUrl.searchParams.set("token", token)

  await chatQueue.add(ChatJobAction.sendChatMessage, {
    type: ChatJobAction.sendChatMessage,
    data: {
      conversation,
      contactInbox,
      text,
      quickReplies: [
        {
          id: createId(),
          label: copy.selectDate,
          buttonType: "url",
          url: pickerUrl.toString(),
          messengerExtensions: true,
        },
      ],
      trackingContext: props.trackingContext,
      metadata,
    },
  })
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
 * Atomically claims the conversation's *current* challenge on behalf of a
 * manual-typed-reply terminator (valid reply / autoSkip), so it can't race a
 * concurrent webview submit to the same challenge — only one terminator may
 * ever report a terminal status. See `.agents/skills/reliability-concurrency`
 * and `handleWebviewSelection`, which claims the same way from the other
 * direction.
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
  const currentChallenge = (
    conversation.additionalAttributes as ConversationAttributes | undefined
  )?.challenge

  if (!currentChallenge) {
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

function toValidDate(value: unknown): Date | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date
  }
}

function checkSkipCondition(
  step: GetUserDataStepSchema,
  conversationVariables: Record<string, Variable>,
): { skip: true; reason: InputFailureReason } | { skip: false } {
  const lastAttemptAt =
    toValidDate(conversationVariables.challengeLastAttemptAt?.value) ??
    new Date()
  const attempts =
    (conversationVariables.challengeAttempts?.value as number) ?? 1

  if (
    isBefore(
      add(lastAttemptAt, {
        [step.autoSkipTimeUnit]: step.autoSkipTimeValue,
      }),
      new Date(),
    )
  ) {
    return {
      skip: true,
      reason: inputFailureReasons.timeout,
    }
  }

  if (attempts >= step.autoSkipFailAttempts) {
    return {
      skip: true,
      reason: inputFailureReasons.invalidInputAttempts,
    }
  }

  return {
    skip: false,
  }
}
