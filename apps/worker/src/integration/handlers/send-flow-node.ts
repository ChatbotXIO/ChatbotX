import { prisma } from "@aha.chat/database"
import type {
  ConversationModel,
  FlowVersionModel,
} from "@aha.chat/database/types"
import { type FlowNode, StepType } from "@aha.chat/flow-config"
import { SdkException } from "@aha.chat/sdk"
import type { IntegrationJobSendFlow } from "@aha.chat/worker-config"
import {
  addContactNotes,
  addContactTag,
  blockContact,
  clearContactCustomField,
  deleteContact,
  markEmailVerified,
  optInEmail,
  optOutEmail,
  removeContactTag,
  setContactCustomField,
} from "./contact-handler"
import {
  archiveConversation,
  assignConversation,
  autoAssignConversation,
  disableBot,
  enableBot,
  followConversation,
  unarchiveConversation,
  unassignConversation,
  unfollowConversation,
} from "./conversation-handler"
import { dispatchFlowStep, type FlowStepProps } from "./step-handler"
import {
  countCharacters,
  formatDate,
  generateCode,
  getDataFromJSON,
} from "./tool-handler"

const flowStepHandlers: Record<
  StepType,
  // biome-ignore lint/suspicious/noExplicitAny: wip
  ((props: FlowStepProps<any>) => Promise<void>) | undefined
> = {
  [StepType.ADD_CONTACT_NOTES]: addContactNotes,
  [StepType.ADD_CONTACT_TAG]: addContactTag,
  [StepType.ADD_TRIGGER]: undefined,
  [StepType.ARCHIVE_CONVERSATION]: archiveConversation,
  [StepType.ASSIGN_CONVERSATION]: assignConversation,
  [StepType.AUTO_ASSIGN_CONVERSATION]: autoAssignConversation,
  [StepType.BLOCK_CONTACT]: blockContact,
  [StepType.CALL_API]: undefined,
  [StepType.CANCEL_CONTACT_INPUT]: undefined,
  [StepType.CLEAR_CUSTOM_FIELD]: clearContactCustomField,
  [StepType.COUNT_CHARACTERS]: countCharacters,
  [StepType.DELETE_CONTACT]: deleteContact,
  [StepType.DISABLE_BOT]: disableBot,
  [StepType.EMAIL_ACTIONS]: undefined,
  [StepType.ENABLE_BOT]: enableBot,
  [StepType.FOLLOW_CONVERSATION]: followConversation,
  [StepType.FORMAT_DATE]: formatDate,
  [StepType.GENERATE_CODE]: generateCode,
  [StepType.GET_DATA_FROM_JSON]: getDataFromJSON,
  [StepType.INBOX_ACTIONS]: undefined,
  [StepType.LANDING_PAGE]: undefined,
  [StepType.MARK_EMAIL_VERIFIED]: markEmailVerified,
  [StepType.NOTIFY_AGENT]: undefined,
  [StepType.OPEN_WEBSITE]: undefined,
  [StepType.OPENAI_ACTIONS]: undefined,
  [StepType.OPENAI_ANALYZE_IMAGE]: undefined,
  [StepType.OPENAI_DELETE_MESSAGE_HISTORY]: undefined,
  [StepType.OPENAI_GENERATE_IMAGE]: undefined,
  [StepType.OPENAI_GENERATE_TEXT_ADVANCED]: undefined,
  [StepType.OPENAI_GENERATE_TEXT_AGENT]: undefined,
  [StepType.OPENAI_GENERATE_TEXT_ASSISTANT]: undefined,
  [StepType.OPENAI_GENERATE_TEXT]: undefined,
  [StepType.OPENAI_SPEECH_TO_TEXT]: undefined,
  [StepType.OPENAI_TEXT_TO_SPEECH]: undefined,
  [StepType.OPT_IN_EMAIL]: optInEmail,
  [StepType.OPT_OUT_EMAIL]: optOutEmail,
  [StepType.OTHERS]: undefined,
  [StepType.PERFORM_ACTION]: undefined,
  [StepType.REMOVE_CONTACT_TAG]: removeContactTag,
  [StepType.SEND_AUDIO]: dispatchFlowStep,
  [StepType.SEND_CARD]: undefined,
  [StepType.SEND_CAROUSEL]: undefined,
  [StepType.SEND_FILE]: dispatchFlowStep,
  [StepType.SEND_FLOW_NODE]: undefined,
  [StepType.SEND_GIF]: undefined,
  [StepType.SEND_IMAGE]: dispatchFlowStep,
  [StepType.SEND_MESSENGER_OTN]: undefined,
  [StepType.SEND_TEXT]: dispatchFlowStep,
  [StepType.SEND_VIDEO]: dispatchFlowStep,
  [StepType.SET_CUSTOM_FIELD]: setContactCustomField,
  [StepType.SET_DEBOUNCE]: undefined,
  [StepType.SPLIT_TRAFFIC]: undefined,
  [StepType.START_ANOTHER_FLOW]: undefined,
  [StepType.START_ANOTHER_STEP]: undefined,
  [StepType.START_EXTERNAL_STEP]: undefined,
  [StepType.START_FLOW_STEP]: undefined,
  [StepType.START_FLOW]: undefined,
  [StepType.TOOLS]: undefined,
  [StepType.TRIGGER_MAKE]: undefined,
  [StepType.TRIGGER_PABBLY]: undefined,
  [StepType.TRIGGER_ZAPIER]: undefined,
  [StepType.UNARCHIVE_CONVERSATION]: unarchiveConversation,
  [StepType.UNASSIGN_CONVERSATION]: unassignConversation,
  [StepType.UNFOLLOW_CONVERSATION]: unfollowConversation,
  [StepType.USER_INPUT]: undefined,
  [StepType.WAIT]: undefined,
  [StepType.ZAPIER_CUSTOM_LOG]: undefined,
}

export const sendFlowNode = async (props: IntegrationJobSendFlow) => {
  if (!(props.data.flowId || props.data.flowVersionId)) {
    throw new SdkException("Expect flowId or flowVersionId to sendFlowNode")
  }

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: props.data.conversationId,
    },
  })
  if (!conversation) {
    throw new SdkException("Conversation not found")
  }

  // Try to find corresponding flowVersion
  let flowVersion: FlowVersionModel | null = null
  if (props.data.flowVersionId) {
    flowVersion = await prisma.flowVersion.findFirst({
      where: {
        id: props.data.flowVersionId,
        chatbotId: conversation.chatbotId,
      },
    })
  } else {
    const flow = await prisma.flow.findFirst({
      where: {
        chatbotId: conversation.chatbotId,
        id: props.data.flowId,
        active: true,
      },
    })
    if (!flow?.currentVersionId) {
      throw new SdkException("Flow not valid")
    }

    flowVersion = await prisma.flowVersion.findFirst({
      where: {
        id: flow.currentVersionId,
      },
    })
  }
  if (!flowVersion) {
    throw new SdkException("FlowVersion not found")
  }

  // NOTES: process flow
  const startNode = (flowVersion.nodes as unknown as FlowNode[]).find((n) =>
    props.data.nodeId ? n.id === props.data.nodeId : n.data.isStartNode,
  )
  if (!startNode) {
    throw new SdkException("FlowVersion does not contain start node")
  }

  const gen = runFlowNode(conversation, flowVersion.id, startNode)
  let result = await gen.next()

  while (!result.done) {
    result = await gen.next()
  }
}

function* runFlowNode(
  conversation: ConversationModel,
  flowVersionId: string,
  node: FlowNode,
) {
  for (const step of node.data.steps) {
    yield flowStepHandlers[step.stepType]?.({
      conversation,
      flowVersionId,
      step,
    })
  }
}
