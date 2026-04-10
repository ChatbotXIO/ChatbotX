import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import type { ConversationAttributes } from "@chatbotx.io/database/partials"
import {
  contactCustomFieldModel,
  conversationModel,
  customFieldModel,
} from "@chatbotx.io/database/schema"
import {
  type GetUserDataStepSchema,
  ReplyFormat,
} from "@chatbotx.io/flow-config"
import { IntegrationException, type Variable } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { ChatJobAction, chatQueue } from "@chatbotx.io/worker-config"
import { add, isBefore } from "date-fns"
import { logger } from "../../lib/logger"
import type { ExecuteStepProps } from "./flow"
import type { ExecuteStepResult } from "./step"

export type GetUserDataResult = {
  valid: boolean
  errorMessage?: string
  userInput?: string
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const phoneRegex = /^\+?(\d[\d-. ]+)?(\([\d-. ]+\))?[\d-. ]+\d$/

export async function getUserData(
  props: ExecuteStepProps<GetUserDataStepSchema>,
): Promise<ExecuteStepResult> {
  const { ctx } = props
  // if state is present, handle logic on skip or failure
  try {
    if (ctx.variables.conversation.challengeAttempts) {
      return await handleSkipOrError(props)
    }

    return await firstSendMessage(props)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(error, "getUserData: error")

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

  if (!ctx.variables.conversation.challengeAttempts) {
    throw new IntegrationException(
      `getUserData: state is not present for conversation ${props.conversation.id}`,
    )
  }

  // if user data is valid, save to custom field if configured
  if (validUserData.valid && validUserData.userInput) {
    if (step.outputFieldId) {
      await findOrFail({
        table: customFieldModel,
        where: {
          id: step.outputFieldId,
          workspaceId: props.conversation.workspaceId,
        },
        message: "Field not found",
      })

      await db.transaction(async (tx) => {
        await tx
          .insert(contactCustomFieldModel)
          .values({
            id: createId(),
            contactId: props.conversation.contactId,
            customFieldId: step.outputFieldId,
            value: validUserData.userInput ?? "",
          })
          .onConflictDoUpdate({
            target: [
              contactCustomFieldModel.contactId,
              contactCustomFieldModel.customFieldId,
            ],
            set: {
              value: validUserData.userInput,
            },
          })
      })
    }

    // remove challenge from conversation attributes
    await db
      .update(conversationModel)
      .set({
        additionalAttributes: {
          ...(props.conversation
            .additionalAttributes as ConversationAttributes),
          challenge: undefined,
        },
      })
      .where(eq(conversationModel.id, props.conversation.id))

    return { result: validUserData.userInput, status: "success" }
  }

  // skip if the time to skip is reached
  if (step.autoSkip) {
    const skipResult = checkSkipCondition(step, ctx.variables.conversation)
    if (skipResult.skip) {
      return { result: undefined, status: "skip" }
    }
  }

  // if user data is invalid, retry
  await sendMessage(
    props,
    step.retryMessage ?? step.message,
    (ctx.variables.conversation.challengeAttempts?.value as number) ?? 1 + 1,
  )

  return { result: undefined, status: "retry" }
}

async function validateUserData(
  props: ExecuteStepProps<GetUserDataStepSchema>,
): Promise<GetUserDataResult> {
  const lastUserMessage = await db.query.messageModel.findFirst({
    where: {
      conversationId: props.conversation.id,
      messageType: "incoming",
    },
    with: {
      attachments: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  })

  const result: GetUserDataResult = {
    valid: false,
    errorMessage: undefined,
    userInput: undefined,
  }

  if (!lastUserMessage) {
    result.valid = false
    result.errorMessage = `getUserData: unable to find last message of conversation ${props.conversation.id}`

    return result
  }

  if (lastUserMessage.attachments.length > 0) {
    if (
      props.step.replyFormat === ReplyFormat.image &&
      lastUserMessage.attachments[0].fileType === "image"
    ) {
      result.valid = true
      result.userInput = lastUserMessage.attachments[0].originPath
      return result
    }
    if (props.step.replyFormat === ReplyFormat.file) {
      result.valid = true
      result.userInput = lastUserMessage.attachments[0].originPath
      return result
    }
    result.errorMessage = "getUserData: invalid user data"
    return result
  }

  if (lastUserMessage.text) {
    switch (props.step.replyFormat) {
      case ReplyFormat.number: {
        const valid = !Number.isNaN(Number.parseFloat(lastUserMessage.text))
        if (valid) {
          result.userInput = lastUserMessage.text
        } else {
          result.errorMessage = "getUserData: invalid email address"
        }
        return result
      }
      case ReplyFormat.email: {
        const valid = emailPattern.test(lastUserMessage.text)
        if (valid) {
          result.userInput = lastUserMessage.text
        } else {
          result.errorMessage = "getUserData: invalid email address"
        }
        return result
      }
      case ReplyFormat.phone: {
        const valid = phoneRegex.test(lastUserMessage.text)
        if (valid) {
          result.userInput = lastUserMessage.text
        } else {
          result.errorMessage = "getUserData: invalid phone number"
        }
        return result
      }
      case ReplyFormat.link: {
        try {
          new URL(lastUserMessage.text)
          result.userInput = lastUserMessage.text
        } catch (_err) {
          result.errorMessage = "getUserData: invalid link"
        }
        return result
      }
      case ReplyFormat.date:
      case ReplyFormat.datetime: {
        const dateObj = new Date(lastUserMessage.text)
        if (Number.isNaN(dateObj.getTime())) {
          result.errorMessage = "getUserData: invalid date"
        } else {
          result.userInput = dateObj.toISOString()
        }
        return result
      }
      default:
        result.valid = true
        result.userInput = lastUserMessage.text
        return result
    }
  }

  result.errorMessage = "getUserData: invalid user data"
  return result
}

async function sendMessage(
  props: ExecuteStepProps<GetUserDataStepSchema>,
  text: string,
  attempts = 1,
) {
  const {
    conversation,
    contactInbox: targetContactInbox,
    flowVersion,
    step,
  } = props

  const contactInbox =
    targetContactInbox ??
    (await db.query.contactInboxModel.findFirst({
      where: {
        contactId: conversation.contactId,
      },
      orderBy: {
        lastMessageAt: "desc",
      },
    }))
  if (!contactInbox) {
    throw new IntegrationException(
      `getUserData: contact inbox not found for conversation ${conversation.id}`,
    )
  }

  await chatQueue.add(ChatJobAction.sendChatMessage, {
    type: ChatJobAction.sendChatMessage,
    data: {
      contactInbox,
      conversation,
      text,
    },
  })

  await db
    .update(conversationModel)
    .set({
      additionalAttributes: {
        ...(conversation.additionalAttributes as ConversationAttributes),
        challenge: {
          type: "step",
          data: {
            flowId: flowVersion.flowId,
            flowVersionId: props.useLatestFlowVersion
              ? undefined
              : flowVersion.id,
            nodeId: props.targetId,
            stepId: step.id,
            attempts,
            lastAttemptAt: new Date(),
          },
        },
      } as ConversationAttributes,
    })
    .where(eq(conversationModel.id, conversation.id))
}

function checkSkipCondition(
  step: GetUserDataStepSchema,
  conversationVariables: Record<string, Variable>,
): { skip: boolean; skipReason?: string } {
  const lastAttemptAt =
    (conversationVariables.challengeLastAttemptAt?.value as Date) ?? new Date()
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
      skipReason: "out of time",
    }
  }

  if (attempts >= step.autoSkipFailAttempts) {
    return {
      skip: true,
      skipReason: "out of attempts",
    }
  }

  return {
    skip: false,
  }
}
