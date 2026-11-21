import {
  conversationService,
  inboxTranslationSettingsService,
  messageService,
  queueWorkspaceRealtimeEvent,
  translationService,
} from "@chatbotx.io/business"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import {
  type RealtimeEventRoute,
  RealtimeEventType,
  routeForConversation,
} from "@chatbotx.io/realtime-protocol"
import { distributedLock, isLockAcquisitionError } from "@chatbotx.io/redis"
import type {
  IntegrationJobDeleteIncomingMessage,
  IntegrationJobUpdateIncomingMessage,
} from "@chatbotx.io/worker-config"
import type { Job } from "bullmq"
import { ingressConversationLockKey } from "../../lib/ingress-lock"
import { isFinalAttempt } from "../../lib/job-attempts"
import { LOCK_CONTENTION_POLICY } from "../../lib/lock-contention-deferral"
import { logger } from "../../lib/logger"
import { integrationService } from "../../services/integrations"

/**
 * Changes of a stored message that its channel reports by the provider's own id
 * (`Message.sourceId`): the provider unsent it, or edited its text. The row is
 * changed in the message repository and the change is published to the inbox.
 */

/**
 * What a handler does when the message is not stored (yet). Default, and for
 * every producer that predates `retryIfMissing`: warn and finish. With
 * `retryIfMissing` the message may still be on its way (its own job has not run
 * yet), so throw to retry, except on the last attempt, which warns once.
 */
const handleMissingMessage = (props: {
  messageId: string
  action: string
  retryIfMissing?: boolean
  job?: Job
}): void => {
  const { messageId, action, retryIfMissing, job } = props
  if (!retryIfMissing) {
    logger.warn({ messageId }, `${action}: message not found`)
    return
  }
  if (job && isFinalAttempt(job)) {
    logger.warn(
      { messageId },
      `${action}: message not found after the last attempt`,
    )
    return
  }
  throw new Error(`${action}: message ${messageId} is not stored yet`)
}

const findRealtimeRoute = async (props: {
  workspaceId: string
  conversationId: string
  action: string
}) => {
  const conversation = await conversationService.findBy({
    where: { id: props.conversationId, workspaceId: props.workspaceId },
  })
  if (!conversation) {
    logger.warn(
      {
        conversationId: props.conversationId,
        workspaceId: props.workspaceId,
      },
      `${props.action}: conversation not found for realtime route`,
    )
  }
  return routeForConversation(conversation)
}

/**
 * The customer edited or unsent a message: its stored translation (and any
 * in-flight claim) describes content that no longer exists. Drops both, and
 * tells the inbox so it does not keep showing the old translation.
 *
 * Runs before the change is published, so the inbox's re-request that follows
 * a `messageUpdated` finds the claim already cleared and is accepted. Skipped
 * when the workspace never switched translation on (nothing to delete, no
 * extra query on the edit/unsend path); one that switched it off again still
 * runs, or turning it back on would show a translation of old content. Best
 * effort: a failure here must not fail an edit/unsend that is already stored.
 */
const dropTranslation = async (props: {
  workspaceId: string
  conversationId: string
  messageId: string
  route: RealtimeEventRoute
  action: string
}): Promise<void> => {
  const { workspaceId, conversationId, messageId, route, action } = props
  try {
    if (
      !(await inboxTranslationSettingsService.hasEverBeenEnabled(workspaceId))
    ) {
      return
    }
    const removed = await translationService.deleteForMessage({
      workspaceId,
      messageId,
    })
    if (!removed) {
      return
    }
    await queueWorkspaceRealtimeEvent(workspaceId, {
      eventType: RealtimeEventType.messageTranslationUpdated,
      data: {
        conversationId,
        items: [{ messageId, status: "translated", removed: true }],
      },
      route,
    })
  } catch (err) {
    logger.warn(
      { err, workspaceId, conversationId, messageId, action },
      "Failed to drop the translation of a changed message",
    )
  }
}

/**
 * Publishes after the conversation's message ingress is done. A change can reach
 * a message in the instant between its insert and its `message.created` event;
 * published then, the inbox would drop the change (it does not know the message
 * yet) and keep the stale text. The row is already changed, so only the event
 * waits. Like the ingress itself, a lock that cannot be acquired degrades to
 * publishing at once rather than failing a change that is already stored.
 */
const publishAfterMessageIngress = async (
  conversationId: string,
  publish: () => Promise<void>,
): Promise<void> => {
  const key = ingressConversationLockKey(conversationId)
  try {
    await distributedLock.runExclusive({
      key,
      timeoutInSeconds: 30,
      retryTimeoutInSeconds: LOCK_CONTENTION_POLICY.lockWaitSeconds,
      fn: publish,
    })
  } catch (error) {
    if (!isLockAcquisitionError(error, key)) {
      throw error
    }
    logger.warn(
      { err: error, conversationId },
      "Unable to acquire ingress lock for conversation; publishing the change unlocked",
    )
    await publish()
  }
}

/**
 * Publishes a change. A change to a message that may still be in flight
 * (`retryIfMissing`) waits for that message's ingress; every other change (a
 * Messenger unsend, a comment edit) publishes at once, as it always has.
 */
const publishChange = async (props: {
  conversationId: string
  waitForIngress: boolean
  publish: () => Promise<void>
}): Promise<void> => {
  if (props.waitForIngress) {
    await publishAfterMessageIngress(props.conversationId, props.publish)
    return
  }
  await props.publish()
}

/**
 * Replaces the text of the message stored under `sourceId` and publishes the
 * new text to the inbox. Shared by the comment edit and the message edit, which
 * differ only in what a missing row means (`onMissing`) and in log wording.
 */
export const applyIncomingTextUpdate = async (props: {
  integrationType: string
  integrationIdentifier: string
  sourceId: string
  newText: string
  action: string
  waitForIngress?: boolean
  onMissing: () => void
}): Promise<void> => {
  const { integrationType, integrationIdentifier, sourceId, newText } = props

  const { inbox } =
    await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
      integrationType as IntegrationType,
      integrationIdentifier,
    )

  const updated = await messageService.updateTextBySourceId({
    sourceId,
    workspaceId: inbox.workspaceId,
    text: newText,
  })

  if (!updated) {
    props.onMissing()
    return
  }

  const route = await findRealtimeRoute({
    workspaceId: inbox.workspaceId,
    conversationId: updated.conversationId,
    action: props.action,
  })
  await dropTranslation({
    workspaceId: inbox.workspaceId,
    conversationId: updated.conversationId,
    messageId: updated.id,
    route,
    action: props.action,
  })
  await publishChange({
    conversationId: updated.conversationId,
    waitForIngress: props.waitForIngress === true,
    publish: () =>
      queueWorkspaceRealtimeEvent(inbox.workspaceId, {
        eventType: RealtimeEventType.messageUpdated,
        data: {
          messageId: updated.id,
          newText,
          removedAttachment: false,
        },
        route,
      }),
  })
}

/** The provider edited a message: show the new text. */
export const updateIncomingMessage = async (
  props: IntegrationJobUpdateIncomingMessage["data"],
  job?: Job,
): Promise<void> => {
  const action = "updateIncomingMessage"
  await applyIncomingTextUpdate({
    integrationType: props.integrationType,
    integrationIdentifier: props.integrationIdentifier,
    sourceId: props.messageId,
    newText: props.newText,
    action,
    waitForIngress: props.retryIfMissing === true,
    onMissing: () =>
      handleMissingMessage({
        messageId: props.messageId,
        action,
        retryIfMissing: props.retryIfMissing,
        job,
      }),
  })
}

// When a contact unsends a previously-sent DM, soft-delete it in the DB and
// broadcast the deletion to the inbox — mirrors deleteIncomingComment, keyed
// on the message's `mid` (already stored as Message.sourceId, see
// saveAndBroadcastMessage).
export const deleteIncomingMessage = async (
  props: IntegrationJobDeleteIncomingMessage["data"],
  job?: Job,
): Promise<void> => {
  const { integrationType, integrationIdentifier, messageId } = props
  const action = "deleteIncomingMessage"

  const { inbox } =
    await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
      integrationType as IntegrationType,
      integrationIdentifier,
    )

  const deleted = await messageService.deleteBySourceId({
    sourceId: messageId,
    workspaceId: inbox.workspaceId,
    createdAtHint: new Date(),
  })

  const [first] = deleted
  if (!first) {
    handleMissingMessage({
      messageId,
      action,
      retryIfMissing: props.retryIfMissing,
      job,
    })
    return
  }

  const route = await findRealtimeRoute({
    workspaceId: inbox.workspaceId,
    conversationId: first.conversationId,
    action,
  })
  for (const row of deleted) {
    await dropTranslation({
      workspaceId: inbox.workspaceId,
      conversationId: row.conversationId,
      messageId: row.id,
      route,
      action,
    })
  }
  await publishChange({
    conversationId: first.conversationId,
    waitForIngress: props.retryIfMissing === true,
    publish: () =>
      queueWorkspaceRealtimeEvent(inbox.workspaceId, {
        eventType: RealtimeEventType.messageDeleted,
        data: { messageIds: deleted.map((row) => row.id) },
        route,
      }),
  })
}
