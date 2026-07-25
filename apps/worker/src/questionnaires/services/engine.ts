import {
  conversationService,
  questionnaireSubmissionService,
} from "@chatbotx.io/business"
import type { ConversationAttributes } from "@chatbotx.io/database/partials"
import {
  createMessageRepository,
  getSafeSinceTime,
} from "@chatbotx.io/database/repositories"
import type { QuestionnaireQuestionModel } from "@chatbotx.io/database/types"
import { webhookChannelOrigin } from "@chatbotx.io/events/context"
import {
  BUTTON_LABEL_MAX,
  MAX_QUICK_REPLIES,
  type QuestionnairesStepSchema,
} from "@chatbotx.io/flow-config"
import {
  MESSENGER_NATIVE_QUICK_REPLY,
  type MessageButtonTemplate,
} from "@chatbotx.io/sdk"
import {
  ChatJobAction,
  chatQueue,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import type { ExecuteStepProps } from "../../integration/handlers/flow-utils"
import type { ExecuteStepResult } from "../../integration/handlers/step"
import { waitForChatJobCompletion } from "../../integration/utils/message"
import { logger } from "../../lib/logger"

const questionText = (question: QuestionnaireQuestionModel): string => {
  if (question.type !== "multipleChoice") {
    return question.title
  }
  const options = question.config?.options ?? []
  if (options.length === 0) {
    return question.title
  }
  return `${question.title}\n${options
    .map((option, index) => `${index + 1}. ${option.label}`)
    .join("\n")}`
}

// Channels whose plain chat message pipeline can render native tappable
// quick-reply buttons (see ChatJobSendChatMessage.quickReplies). Other
// channels (WhatsApp, Zalo, TikTok, ...) keep the numbered-text fallback.
// ContactInboxModel.channel is a plain text column (not the ChannelType
// pgEnum), so this is checked against the raw string value.
const QUICK_REPLY_CHANNELS = new Set([
  "messenger",
  "instagram",
  "telegram",
  "webchat",
])

// Answer matching (questionnaireSubmissionService) accepts either the
// option id or its label, so using the id as the tap payload works
// uniformly: Meta channels echo the button title back as text, Telegram
// echoes the callback payload itself.
const questionQuickReplies = (
  question: QuestionnaireQuestionModel,
  channel: string,
): MessageButtonTemplate[] | undefined => {
  if (
    question.type !== "multipleChoice" ||
    !QUICK_REPLY_CHANNELS.has(channel)
  ) {
    return
  }
  const options = question.config?.options ?? []
  if (
    options.length === 0 ||
    options.length > MAX_QUICK_REPLIES ||
    options.some((option) => option.label.length > BUTTON_LABEL_MAX)
  ) {
    return
  }
  return options.map((option) => ({
    id: option.id,
    label: option.label,
    buttonType: "postback" as const,
    postback: option.id,
  }))
}

// Messenger's Send API can render its native "share your email / phone"
// quick reply (content_type "user_email" / "user_phone_number"), which
// Facebook fills from the contact's own account at tap time — we never need
// to already know the value. Restricted to Messenger only: it's the only
// channel that supports these native content types. The button carries a
// reserved MESSENGER_NATIVE_QUICK_REPLY payload; the messenger channel's
// quick reply converter recognizes it and swaps in the native content_type
// instead of rendering it as a literal text button.
const NATIVE_SUGGESTABLE_QUESTION_TYPES = new Set(["email", "phone"])

function nativeContactQuickReply(
  question: QuestionnaireQuestionModel,
  channel: string,
): MessageButtonTemplate[] | undefined {
  if (
    channel !== "messenger" ||
    !NATIVE_SUGGESTABLE_QUESTION_TYPES.has(question.type)
  ) {
    return
  }
  const payload =
    question.type === "email"
      ? MESSENGER_NATIVE_QUICK_REPLY.USER_EMAIL
      : MESSENGER_NATIVE_QUICK_REPLY.USER_PHONE_NUMBER
  return [
    {
      id: payload,
      label: question.title,
      buttonType: "postback",
      postback: payload,
    },
  ]
}

const QUESTIONNAIRE_MESSAGE_LOOKBACK_MS = 365 * 24 * 60 * 60 * 1000

// Known gap: does not forward `props.commentAnchor` — moot in practice today
// since a questionnaire always waits for the user's answer between
// questions, which already drops the anchor before completion (same
// wait-boundary semantics as `handleWait`/`handleFollowUp`). Revisit if a
// questionnaire step is ever made to complete without any wait.
async function startTriggerFlow(
  props: ExecuteStepProps<QuestionnairesStepSchema>,
  flowId: string | null | undefined,
) {
  if (!flowId) {
    return
  }

  await integrationQueue.add(IntegrationJobAction.sendFlow, {
    type: IntegrationJobAction.sendFlow,
    data: {
      conversationId: props.conversation.id,
      contactInboxId: props.contactInbox.id,
      flowId,
      metadata: props.metadata,
      trackingContext: props.trackingContext,
      sendFrom: props.sendFrom,
      origin: webhookChannelOrigin(),
    },
  })
}

function toValidDate(value: Date | number | string | null | undefined) {
  if (!value) {
    return
  }
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date : undefined
}

function getLastIncomingSinceTime(
  props: ExecuteStepProps<QuestionnairesStepSchema>,
) {
  const anchor =
    toValidDate(props.conversation.lastActivityAt) ??
    toValidDate(props.conversation.createdAt) ??
    new Date()
  const sinceTime = getSafeSinceTime(anchor, QUESTIONNAIRE_MESSAGE_LOOKBACK_MS)
  if (sinceTime) {
    return sinceTime
  }
  const fallback = new Date(
    anchor.getTime() - QUESTIONNAIRE_MESSAGE_LOOKBACK_MS,
  )
  fallback.setMinutes(0, 0, 0)
  return fallback
}

async function sendQuestion(
  props: ExecuteStepProps<QuestionnairesStepSchema>,
  data: {
    submissionId: string
    question: QuestionnaireQuestionModel
    text?: string | null
    sentAt?: Date
    attempts: number
  },
) {
  const sentAt = data.sentAt ?? new Date()
  const quickReplies =
    questionQuickReplies(data.question, props.contactInbox.channel) ??
    nativeContactQuickReply(data.question, props.contactInbox.channel)
  const job = await chatQueue.add(ChatJobAction.sendChatMessage, {
    type: ChatJobAction.sendChatMessage,
    data: {
      contactInbox: props.contactInbox,
      conversation: props.conversation,
      text:
        data.text?.trim() ||
        (quickReplies ? data.question.title : questionText(data.question)),
      url: data.question.image?.url,
      quickReplies,
    },
  })
  await waitForChatJobCompletion(job, { conversationId: props.conversation.id })

  await questionnaireSubmissionService.markQuestionSent({
    workspaceId: props.conversation.workspaceId,
    submissionId: data.submissionId,
    questionId: data.question.id,
    sentAt,
  })

  await conversationService.updateChallenge({
    workspaceId: props.conversation.workspaceId,
    conversationId: props.conversation.id,
    challenge: {
      type: "step",
      data: {
        flowId: props.flowVersion.flowId,
        flowVersionId: props.useLatestFlowVersion
          ? undefined
          : props.flowVersion.id,
        nodeId: props.targetId ?? props.targetNodeId ?? "",
        stepId: props.step.id,
        attempts: data.attempts,
        lastAttemptAt: sentAt,
      },
    },
  })
}

async function getLastIncomingText(
  props: ExecuteStepProps<QuestionnairesStepSchema>,
) {
  const messageRepository = await createMessageRepository()
  if (props.triggerMessageId && props.triggerMessageCreatedAt) {
    const message = await messageRepository.findById({
      id: props.triggerMessageId,
      createdAt: props.triggerMessageCreatedAt,
      workspaceId: props.conversation.workspaceId,
    })
    if (
      message?.conversationId === props.conversation.id &&
      message.senderType === "contact" &&
      message.messageType === "incoming"
    ) {
      return message.text ?? ""
    }
  }

  const [message] = await messageRepository.findLastByConversation(
    props.conversation.id,
    {
      workspaceId: props.conversation.workspaceId,
      messageTypes: ["incoming"],
      limit: 1,
      requireCompleteResults: true,
      withAttachments: false,
      sinceTime: getLastIncomingSinceTime(props),
    },
  )
  return message?.text ?? ""
}

async function startOrResumeQuestionnaire(
  props: ExecuteStepProps<QuestionnairesStepSchema>,
): Promise<ExecuteStepResult> {
  const { conversation, step } = props
  const startResult = await questionnaireSubmissionService.startOrResume({
    workspaceId: conversation.workspaceId,
    questionnaireId: step.questionnaireId,
    contactId: conversation.contactId,
    conversationId: conversation.id,
  })

  if (startResult.status === "skip") {
    logger.info(
      {
        conversationId: conversation.id,
        contactId: conversation.contactId,
        questionnaireId: step.questionnaireId,
        reason: startResult.reason,
      },
      "Questionnaire start skipped",
    )
    if (startResult.reason === "questionnaire_already_submitted") {
      return { status: "wait", result: startResult.reason }
    }
    return { status: "success", result: startResult.reason }
  }

  await sendQuestion(props, {
    submissionId: startResult.submission.id,
    question: startResult.question,
    attempts: 0,
  })
  return { status: "wait", result: null }
}

export async function runQuestionnaireEngine(
  props: ExecuteStepProps<QuestionnairesStepSchema>,
): Promise<ExecuteStepResult> {
  const { conversation, step } = props

  if (step.mode === "end") {
    await questionnaireSubmissionService.cancel({
      workspaceId: conversation.workspaceId,
      questionnaireId: step.questionnaireId,
      contactId: conversation.contactId,
    })
    await conversationService.updateChallenge({
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      challenge: undefined,
    })
    return { status: "success", result: null }
  }

  if (step.mode === "deleteApplicant") {
    await questionnaireSubmissionService.deleteApplicant({
      workspaceId: conversation.workspaceId,
      questionnaireId: step.questionnaireId,
      contactId: conversation.contactId,
    })
    await conversationService.updateChallenge({
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      challenge: undefined,
    })
    return { status: "success", result: null }
  }

  const attributes = conversation.additionalAttributes as
    | ConversationAttributes
    | undefined
  if (attributes?.challenge) {
    const attempts =
      (props.ctx?.variables.conversation.challengeAttempts?.value as
        | number
        | undefined) ?? 0
    const rawText = await getLastIncomingText(props)
    const result = await questionnaireSubmissionService.answerCurrent({
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      conversationId: conversation.id,
      questionnaireId: step.questionnaireId,
      rawText,
      attempts,
      triggerMessageId: props.triggerMessageId,
    })

    if (result.status === "retry") {
      logger.info(
        {
          conversationId: conversation.id,
          questionnaireId: step.questionnaireId,
          reason: result.reason,
        },
        "Questionnaire answer rejected, retrying",
      )
      await sendQuestion(props, {
        submissionId: result.submissionId,
        question: result.question,
        text: result.retryMessage,
        attempts: result.attempts,
      })
      return { status: "retry", result: null }
    }

    if (result.status === "completed") {
      await conversationService.updateChallenge({
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        challenge: undefined,
      })
      await startTriggerFlow(props, result.triggerFlowId)
      return { status: "success", result: result.submissionId }
    }

    if (result.status === "wait") {
      await sendQuestion(props, {
        submissionId: result.submissionId,
        question: result.question,
        sentAt: result.sentAt,
        attempts: 0,
      })
      return { status: "wait", result: null }
    }

    if (result.status === "skip" && result.reason === "submission_not_found") {
      logger.info(
        {
          conversationId: conversation.id,
          contactId: conversation.contactId,
          questionnaireId: step.questionnaireId,
        },
        "Questionnaire challenge has no active submission, starting configured questionnaire",
      )
      return await startOrResumeQuestionnaire(props)
    }

    await conversationService.updateChallenge({
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      challenge: undefined,
    })
    return { status: "success", result: result.reason }
  }

  return await startOrResumeQuestionnaire(props)
}
