import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { type FlowNode, stepTypes } from "@chatbotx.io/flow-config"
import { resolveConversationMessagingWindow } from "@chatbotx.io/sdk"
import { isManualSend, type SendFrom } from "@chatbotx.io/utils/send-from"
import { messagingWindowClosedException } from "../errors"
import { flowService } from "../flow/service"
import { flowVersionService } from "../flow-version/service"

interface AssertManualSendWindowOpenProps {
  contactInbox: Pick<ContactInboxModel, "channel" | "lastIncomingMessageAt">
  conversation: Pick<ConversationModel, "sourceId">
  input: { flowId?: string; nodeId?: string }
  sendFrom: SendFrom | undefined
  workspaceId: string
}

const TEMPLATE_STEP_TYPES: ReadonlySet<string> = new Set([
  stepTypes.enum.sendWaTemplateMessage,
  stepTypes.enum.sendMessengerTemplateMessage,
])

/**
 * Front gate for a manual (Inbox / API) send: refuses with a 409 before
 * anything is queued, when the channel's messaging window is closed. A flow
 * whose first step is a template is let through; templates are the one thing
 * a closed window still allows. Callers: `sendOutgoing`, `contacts.sendFlow`,
 * `contacts.triggerAutoReply`. Not in `createOutgoing`: system sends (order
 * notifications) must not throw there.
 */
export async function assertManualSendWindowOpen(
  props: AssertManualSendWindowOpenProps,
): Promise<void> {
  if (!isManualSend(props.sendFrom)) {
    return
  }
  const { state } = resolveConversationMessagingWindow({
    channel: props.contactInbox.channel,
    sourceId: props.conversation.sourceId,
    lastIncomingMessageAt: props.contactInbox.lastIncomingMessageAt,
  })
  if (state !== "closed") {
    return
  }
  if (await startsWithTemplateStep(props)) {
    return
  }
  throw messagingWindowClosedException(props.contactInbox.channel)
}

async function startsWithTemplateStep(props: {
  input: { flowId?: string; nodeId?: string }
  workspaceId: string
}): Promise<boolean> {
  const { flowId, nodeId } = props.input
  if (!flowId) {
    return false
  }
  const flow = await flowService.findActiveById({
    id: flowId,
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
    nodeId ? candidate.id === nodeId : candidate.data.isStartNode,
  )
  const firstStep =
    node?.data.details && "steps" in node.data.details
      ? node.data.details.steps[0]
      : undefined
  return firstStep !== undefined && TEMPLATE_STEP_TYPES.has(firstStep.stepType)
}
