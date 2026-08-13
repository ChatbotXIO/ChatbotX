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
import { isMessageStorageError } from "@chatbotx.io/database/errors"
import {
  createMessageRepository,
  getSafeSinceTime,
} from "@chatbotx.io/database/repositories"
import {
  type GetUserDataStepSchema,
  type InputFailureReason,
  inputFailureReasons,
  type SendTextStepSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import { IntegrationException, type Variable } from "@chatbotx.io/sdk"
import { add, isBefore } from "date-fns"
import { logger } from "../../lib/logger"
import type { ExecuteStepProps } from "./flow"
import { enqueueFlowStepMessage } from "./flow-utils"
import type { ExecuteStepResult } from "./step"

export async function getUserData(
  props: ExecuteStepProps<GetUserDataStepSchema>,
): Promise<ExecuteStepResult> {
  const { ctx } = props
  // if state is present, handle logic on skip or failure
  try {
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

    await clearChallenge({
      workspaceId: props.conversation.workspaceId,
      conversationId: props.conversation.id,
    })

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

      await clearChallenge({
        workspaceId: props.conversation.workspaceId,
        conversationId: props.conversation.id,
      })

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
    step.retryMessage ?? step.message,
    ((ctx?.variables.conversation.challengeAttempts?.value as number) ?? 1) + 1,
  )

  return { result: undefined, status: "retry" }
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

async function sendMessage(
  props: ExecuteStepProps<GetUserDataStepSchema>,
  text: string,
  attempts = 1,
) {
  const { conversation, contactInbox, flowVersion, step } = props
  const nodeId = props.targetId
  if (!nodeId) {
    throw new IntegrationException(
      `getUserData: missing target node for conversation ${conversation.id}`,
    )
  }

  const flowVersionId = props.useLatestFlowVersion ? undefined : flowVersion.id

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
      },
    },
  })

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
