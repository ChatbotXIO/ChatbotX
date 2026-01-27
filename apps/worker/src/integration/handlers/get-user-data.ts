import { FieldType, MessageType, prisma } from "@aha.chat/database"
import type { ConversationAttributes } from "@aha.chat/database/types"
import type { GetUserDataStepSchema } from "@aha.chat/flow-config"
import { IntegrationException } from "@aha.chat/sdk"
import { ChatJobAction, chatQueue } from "@aha.chat/worker-config"
import { add, isBefore } from "date-fns"
import type { ExecuteStepProps } from "./flow"
import type { StepStatus } from "./step"

type GetUserDataState = {
  attempts: number
  lastAttemptAt: Date
}

export async function getUserData(
  props: ExecuteStepProps<GetUserDataStepSchema, GetUserDataState>,
): Promise<{ status: StepStatus; wait: boolean }> {
  // if state is present, handle logic on skip or failure
  if (props.state) {
    return await handleSkipOrFailure(props)
  }

  return await firstSendMessage(props)
}

async function firstSendMessage(
  props: ExecuteStepProps<GetUserDataStepSchema, GetUserDataState>,
): Promise<{ status: StepStatus; wait: boolean }> {
  const { step } = props

  await sendMessage(props, step.message)

  return { wait: true, status: "success" }
}

async function handleSkipOrFailure(
  props: ExecuteStepProps<GetUserDataStepSchema, GetUserDataState>,
): Promise<{ status: StepStatus; wait: boolean }> {
  const { step, state } = props
  const validUserData = await validateUserData(props)

  if (!state) {
    throw new IntegrationException(
      `getUserData: state is not present for conversation ${props.conversation.id}`,
    )
  }

  if (validUserData.valid) {
    // if user data is valid, save to custom field if configured
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

        await prisma.contactCustomField.upsert({
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
            value: validUserData.userInput,
          },
        })

        // remove challenge from conversation attributes
        await tx.conversation.update({
          where: { id: props.conversation.id },
          data: {
            conversationAttributes: {
              ...(props.conversation
                .conversationAttributes as ConversationAttributes),
              challenge: undefined,
            },
          },
        })
      })
    }

    return { wait: false, status: "success" }
  }

  // skip if the time to skip is reached
  if (step.autoSkip) {
    const skipResult = checkSkipCondition(step, state)
    if (skipResult.skip) {
      return { wait: false, status: "skip" }
    }
  }

  // if user data is invalid, retry
  await handleRetry(props)

  return { wait: true, status: "retry" }
}

async function validateUserData(
  props: ExecuteStepProps<GetUserDataStepSchema, GetUserDataState>,
): Promise<{
  valid: boolean
  userInput: string
}> {
  const lastUserMessage = await prisma.message.findFirst({
    where: {
      conversationId: props.conversation.id,
      messageType: MessageType.incoming,
    },
    orderBy: {
      createdAt: "desc",
    },
  })

  if (!lastUserMessage?.content) {
    throw new IntegrationException(
      `getUserData: unable to find last message of conversation ${props.conversation.id}`,
    )
  }

  // TODO: validate input

  return {
    valid: true,
    userInput: lastUserMessage.content,
  }
}

async function handleRetry(
  props: ExecuteStepProps<GetUserDataStepSchema, GetUserDataState>,
) {
  const { step, state } = props
  await sendMessage(
    props,
    step.retryMessage ?? step.message,
    (state?.attempts ?? 1) + 1,
  )
}

async function sendMessage(
  props: ExecuteStepProps<GetUserDataStepSchema, GetUserDataState>,
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
  state: GetUserDataState,
): { skip: boolean; skipReason?: string } {
  const lastAttemptAt = state?.lastAttemptAt ?? new Date()
  const attempts = state?.attempts ?? 1

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
