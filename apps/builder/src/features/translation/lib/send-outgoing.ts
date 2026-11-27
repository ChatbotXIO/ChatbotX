import {
  flowService,
  flowVersionService,
  messageService,
} from "@chatbotx.io/business"
import { messagingWindowClosedException } from "@chatbotx.io/business/errors"
import type {
  ContactInboxModel,
  ConversationModel,
  UserModel,
} from "@chatbotx.io/database/types"
import { type FlowNode, stepTypes } from "@chatbotx.io/flow-config"
import {
  isDirectConversationSource,
  resolveMessagingWindow,
} from "@chatbotx.io/sdk"
import { channelTypes } from "@chatbotx.io/utils/channel"
import { isManualSend } from "@chatbotx.io/utils/send-from"
import type { EditedTranslation } from "./create-translated-outgoing"

type CreateOutgoingArgs = Parameters<typeof messageService.createOutgoing>[0]

/**
 * The one place an Inbox/API send decides whether translation is involved.
 * Without `translate: true` it is `messageService.createOutgoing` untouched, so
 * every existing caller and response is unchanged; with it, the send goes
 * through {@link createOutgoingWithTranslation} and the response carries
 * `translation`, `translationFallback` and `editedTranslationDiscarded`.
 */
export async function sendOutgoing<
  TInput extends {
    translate?: boolean
    editedTranslation?: EditedTranslation
  },
>(props: {
  workspaceId: string
  conversation: ConversationModel
  contactInbox: ContactInboxModel
  input: TInput
  user?: Pick<UserModel, "id">
  sendFrom: CreateOutgoingArgs["sendFrom"]
}) {
  // Refuse before anything is queued, so API, CLI and MCP callers get the
  // error now instead of a 202 and a failure in the worker. The worker keeps
  // its own check: the window can close while the job waits.
  await assertMessagingWindowOpen(props)

  const { translate, editedTranslation, ...input } = props.input
  const base = {
    conversation: props.conversation,
    contactInbox: props.contactInbox,
    // Omitted, not `undefined`: a workspace-token send has no user.
    ...(props.user && { user: props.user }),
    sendFrom: props.sendFrom,
  }
  if (translate !== true) {
    return await messageService.createOutgoing({ ...base, input })
  }

  // Loaded only when asked for: most sends never translate, and this pulls in
  // the AI provider SDKs.
  const { createOutgoingWithTranslation } = await import(
    "./create-translated-outgoing"
  )
  const result = await createOutgoingWithTranslation({
    ...base,
    workspaceId: props.workspaceId,
    input,
    editedTranslation,
  })
  return result.message
    ? {
        ...result.message,
        translation: result.translation,
        translationFallback: result.translationFallback,
        editedTranslationDiscarded: result.editedTranslationDiscarded,
      }
    : result.message
}

async function assertMessagingWindowOpen(props: {
  workspaceId: string
  conversation: ConversationModel
  contactInbox: ContactInboxModel
  input: CreateOutgoingArgs["input"]
  sendFrom: CreateOutgoingArgs["sendFrom"]
}): Promise<void> {
  if (!isManualSend(props.sendFrom)) {
    return
  }
  const channel = channelTypes.safeParse(props.contactInbox.channel)
  if (!channel.success) {
    return
  }
  const { state } = resolveMessagingWindow({
    channel: channel.data,
    isDirect: isDirectConversationSource(props.conversation.sourceId),
    lastIncomingMessageAt: props.contactInbox.lastIncomingMessageAt,
  })
  if (state === "closed") {
    if (await isTemplateFirstFlow(props)) {
      return
    }
    throw messagingWindowClosedException(props.contactInbox.channel)
  }
}

async function isTemplateFirstFlow(props: {
  workspaceId: string
  input: CreateOutgoingArgs["input"]
}): Promise<boolean> {
  const { input } = props
  if (!("flowId" in input)) {
    return false
  }
  const flow = await flowService.findActiveById({
    id: input.flowId,
    workspaceId: props.workspaceId,
  })
  if (!flow?.currentVersionId) {
    return false
  }
  const version = await flowVersionService.findByIdForWorkspace({
    versionId: flow.currentVersionId,
    workspaceId: props.workspaceId,
  })
  const node = (version?.nodes as FlowNode[] | undefined)?.find((candidate) =>
    input.nodeId ? candidate.id === input.nodeId : candidate.data.isStartNode,
  )
  const firstStep =
    node?.data.details && "steps" in node.data.details
      ? node.data.details.steps[0]
      : undefined

  return (
    firstStep?.stepType === stepTypes.enum.sendWaTemplateMessage ||
    firstStep?.stepType === stepTypes.enum.sendMessengerTemplateMessage
  )
}
