import { FieldType, FileType, MessageType, prisma } from "@aha.chat/database"
import type { ConversationAttributes } from "@aha.chat/database/types"
import { type GetUserDataStepSchema, ReplyFormat } from "@aha.chat/flow-config"
import { IntegrationException, type Variable } from "@aha.chat/sdk"
import { ChatJobAction, chatQueue } from "@aha.chat/worker-config"
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
    if (step.outputCfId) {
      await prisma.$transaction(async (tx) => {
        await tx.field.findFirstOrThrow({
          where: {
            id: step.outputCfId,
            fieldType: FieldType.customField,
            chatbotId: props.conversation.chatbotId,
          },
          select: {
            id: true,
          },
        })

        await tx.contactCustomField.upsert({
          where: {
            contactId_customFieldId: {
              contactId: props.conversation.contactId,
              customFieldId: step.outputCfId,
            },
          },
          update: {
            value: validUserData.userInput,
          },
          create: {
            contactId: props.conversation.contactId,
            customFieldId: step.outputCfId,
            value: validUserData.userInput ?? "",
          },
        })
      })
    }

    // remove challenge from conversation attributes
    await prisma.conversation.update({
      where: { id: props.conversation.id },
      data: {
        conversationAttributes: {
          ...(props.conversation
            .conversationAttributes as ConversationAttributes),
          challenge: undefined,
        },
      },
    })

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
  const lastUserMessage = await prisma.message.findFirst({
    where: {
      conversationId: props.conversation.id,
      messageType: MessageType.incoming,
    },
    include: {
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
      lastUserMessage.attachments[0].fileType === FileType.image
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

  if (lastUserMessage.content) {
    switch (props.step.replyFormat) {
      case ReplyFormat.number: {
        const valid = !Number.isNaN(Number.parseFloat(lastUserMessage.content))
        if (valid) {
          result.userInput = lastUserMessage.content
        } else {
          result.errorMessage = "getUserData: invalid email address"
        }
        return result
      }
      case ReplyFormat.email: {
        const valid = emailPattern.test(lastUserMessage.content)
        if (valid) {
          result.userInput = lastUserMessage.content
        } else {
          result.errorMessage = "getUserData: invalid email address"
        }
        return result
      }
      case ReplyFormat.phone: {
        const valid = phoneRegex.test(lastUserMessage.content)
        if (valid) {
          result.userInput = lastUserMessage.content
        } else {
          result.errorMessage = "getUserData: invalid phone number"
        }
        return result
      }
      case ReplyFormat.link: {
        try {
          new URL(lastUserMessage.content)
          result.userInput = lastUserMessage.content
        } catch (_err) {
          result.errorMessage = "getUserData: invalid link"
        }
        return result
      }
      case ReplyFormat.date:
      case ReplyFormat.datetime: {
        const dateObj = new Date(lastUserMessage.content)
        if (Number.isNaN(dateObj.getTime())) {
          result.errorMessage = "getUserData: invalid date"
        } else {
          result.userInput = dateObj.toISOString()
        }
        return result
      }
      default:
        result.valid = true
        result.userInput = lastUserMessage.content
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
  const { conversation, flowVersion, step } = props

  await chatQueue.add(ChatJobAction.sendChatMessage, {
    type: ChatJobAction.sendChatMessage,
    data: {
      conversationId: conversation.id,
      text,
    },
  })

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      conversationAttributes: {
        ...(conversation.conversationAttributes as ConversationAttributes),
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
    },
  })
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
