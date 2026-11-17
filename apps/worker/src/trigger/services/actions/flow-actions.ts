import { contactInboxService, flowService } from "@chatbotx.io/business"
import {
  type ContactSource,
  contactSources,
} from "@chatbotx.io/database/partials"
import { startExternalStepActionSchema } from "@chatbotx.io/flow-config"
import baseLogger from "@chatbotx.io/logger"
import {
  IntegrationJobAction,
  type IntegrationJobRunFlowNode,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { buildSendFlowJob } from "../../../integration/handlers/send-flow-job"
import type { ActionExecutionContext } from "../../types"
import { skipped, succeeded, type TriggerActionHandler } from "./types"

/**
 * An inbound-webhook action may run again after a retry that lost its
 * checkpoint; a deterministic job id keeps the flow from being sent twice.
 * Trigger runs keep their existing, unkeyed behaviour.
 */
const enqueueSendFlow = async (
  sendFlowJob: IntegrationJobRunFlowNode,
  context: ActionExecutionContext,
): Promise<void> => {
  if (context.source.kind === "inboundWebhook" && context.occurrenceKey) {
    await integrationQueue.add(IntegrationJobAction.sendFlow, sendFlowJob, {
      jobId: `send-flow-${context.occurrenceKey.replaceAll(":", "-")}`,
    })
    return
  }
  await integrationQueue.add(IntegrationJobAction.sendFlow, sendFlowJob)
}

const COMMENT_CONTACT_SOURCES: ReadonlySet<ContactSource> = new Set([
  contactSources.enum.comments,
  contactSources.enum.liveComments,
])

/**
 * A contact created by a post/live comment who has never sent a message.
 *
 * A trigger-started flow is a normal DM: nothing anchors it to the comment, so
 * the channel only delivers it once the contact has messaged the account
 * (Messenger answers `(#551) This person isn't available right now`). Every
 * "New Contact" trigger fired for such a commenter used to leave a failed
 * message in the post's conversation. A comment reply — public or private —
 * belongs to Comment automation, which addresses the commenter by comment id.
 *
 * Matched on the contact inbox's source, not on "never messaged" alone: a
 * "New Contact" trigger fires before the first DM of a messaging contact is
 * stored, so that contact has no `lastIncomingMessageAt` yet either.
 */
async function isCommentOnlyContact(props: {
  contactInboxId: string
  workspaceId: string
}): Promise<boolean> {
  const contactInbox = await contactInboxService.findByIdForWorkspace({
    id: props.contactInboxId,
    workspaceId: props.workspaceId,
  })
  if (!contactInbox) {
    return false
  }
  return (
    COMMENT_CONTACT_SOURCES.has(contactInbox.source as ContactSource) &&
    contactInbox.lastIncomingMessageAt === null
  )
}

const skipCommentOnlyContact = async (props: {
  contactInboxId: string
  workspaceId: string
  flowId: string
}) => {
  if (!(await isCommentOnlyContact(props))) {
    return null
  }
  baseLogger.info(
    props,
    "Skipping trigger flow: the contact has only commented and never messaged",
  )
  return skipped("contactNeverMessaged")
}

export const startAnotherFlow: TriggerActionHandler = async ({
  context,
  conversation,
  scope,
}) => {
  const { action, contactId, source, workspaceId } = context
  const contactInbox = await scope.getContactInbox()
  if (!contactInbox) {
    baseLogger.warn(
      `No contact inbox found for contact ${contactId}, skipping startAnotherFlow action`,
    )
    return skipped("noContactInbox")
  }

  const flowId = action.flowId as string
  if (context.decisionFlowOrigin?.flowId === flowId) {
    baseLogger.info(
      { flowId, source },
      "Skipping Decision-origin Flow self-loop",
    )
    return succeeded
  }
  const flow = await flowService.findActiveById({
    workspaceId,
    id: flowId,
  })

  if (!flow?.currentVersionId) {
    baseLogger.warn(
      `Flow ${flowId} not found or not active, skipping startAnotherFlow action`,
    )
    return skipped("flowInactive")
  }

  const commentOnlySkip = await skipCommentOnlyContact({
    contactInboxId: contactInbox.id,
    workspaceId,
    flowId,
  })
  if (commentOnlySkip) {
    return commentOnlySkip
  }

  const sendFlowJob = buildSendFlowJob({
    conversationId: conversation,
    contactInboxId: contactInbox.id,
    flowId,
  })
  await enqueueSendFlow(sendFlowJob, context)
  return succeeded
}

/** Starts a flow at one of its nodes, reusing the flow step's node entry. */
export const startExternalStep: TriggerActionHandler = async ({
  context,
  conversation,
  scope,
}) => {
  const parsed = startExternalStepActionSchema.safeParse(context.action)
  if (!parsed.success) {
    return skipped("invalidAction")
  }
  const { flowId, nodeId } = parsed.data
  const { workspaceId, source } = context

  const contactInbox = await scope.getContactInbox()
  if (!contactInbox) {
    return skipped("noContactInbox")
  }
  if (context.decisionFlowOrigin?.flowId === flowId) {
    baseLogger.info(
      { flowId, source },
      "Skipping Decision-origin Flow self-loop",
    )
    return succeeded
  }

  const status = await flowService.resolveStartTarget({
    workspaceId,
    flowId,
    nodeId,
  })
  if (status !== "ready") {
    // The status names the reason: flowNotFound, flowInactive, flowNotPublished, nodeNotFound.
    return skipped(status)
  }

  const commentOnlySkip = await skipCommentOnlyContact({
    contactInboxId: contactInbox.id,
    workspaceId,
    flowId,
  })
  if (commentOnlySkip) {
    return commentOnlySkip
  }

  await enqueueSendFlow(
    buildSendFlowJob({
      conversationId: conversation,
      contactInboxId: contactInbox.id,
      flowId,
      nodeId,
    }),
    context,
  )
  return succeeded
}
