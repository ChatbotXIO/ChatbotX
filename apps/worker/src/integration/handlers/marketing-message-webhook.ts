import {
  contactInboxService,
  conversationService,
  facebookMarketingMessageDeliveryService,
  parseMarketingMessageWebhook,
  resolveTenantSettings,
  summarizeMarketingMessage,
  withBlockedOwnerGuard,
} from "@chatbotx.io/business"
import { mmContentSchema } from "@chatbotx.io/database/partials"
import type { FacebookMarketingMessageModel } from "@chatbotx.io/database/types"
import type { IntegrationJobProcessMarketingMessageWebhook } from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import { integrationService } from "../../services/integrations"
import { saveAndBroadcastMessage } from "./received-message"

/** Inbox text for a marketing message whose content has no text to show. */
const FALLBACK_TEXT = "[Marketing message]"

/**
 * One raw `marketing_message_*` Page webhook change: parse, apply to the
 * delivery service, and (for echoes with a PSID) mirror the message into the
 * inbox as an outgoing message. Never creates contacts (spec call 5). An
 * unparseable value is logged and dropped without throwing (no retry).
 */
export async function processMarketingMessageWebhook(
  data: IntegrationJobProcessMarketingMessageWebhook["data"],
): Promise<void> {
  const { pageId, field, value } = data
  const event = parseMarketingMessageWebhook(field, value)
  if (!event) {
    logger.warn(
      {
        pageId,
        field,
        valueKeys:
          value && typeof value === "object"
            ? Object.keys(value)
            : typeof value,
      },
      "Unrecognized marketing message webhook payload",
    )
    return
  }

  const result =
    await facebookMarketingMessageDeliveryService.applyWebhook(event)
  if (
    !(result.applied && result.campaign) ||
    event.field !== "marketing_message_echoes" ||
    !event.psid
  ) {
    return
  }
  if (!event.mid) {
    logger.debug(
      { pageId, campaignRowId: result.campaign.id },
      "Marketing message echo has a PSID but no mid; not mirrored to the inbox",
    )
    return
  }
  const { campaign } = result
  const { psid, mid } = event

  // Only the inbox mirror is guarded: the status update above must still
  // apply for a blocked workspace.
  await withBlockedOwnerGuard(campaign.workspaceId, () =>
    mirrorEchoToInbox({ pageId, campaign, psid, mid }),
  )
}

async function mirrorEchoToInbox(props: {
  pageId: string
  campaign: FacebookMarketingMessageModel
  psid: string
  mid: string
}): Promise<void> {
  const { pageId, campaign, psid, mid } = props

  const { inbox } =
    await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
      "messenger",
      pageId,
    )
  // Tenant guard: the page must belong to the campaign's workspace.
  if (inbox.workspaceId !== campaign.workspaceId) {
    logger.warn(
      { pageId, campaignRowId: campaign.id },
      "Marketing message echo page does not match campaign workspace",
    )
    return
  }

  const contactInbox = await contactInboxService.findLatestBySource({
    inboxId: inbox.id,
    sourceId: psid,
    workspaceId: campaign.workspaceId,
  })
  if (!contactInbox) {
    return
  }
  const conversation = await conversationService.findDMByContactInbox({
    workspaceId: campaign.workspaceId,
    contactId: contactInbox.contactId,
    contactInboxId: contactInbox.id,
  })
  if (!conversation) {
    return
  }

  const content = mmContentSchema.safeParse(campaign.content)
  const summary = content.success ? summarizeMarketingMessage(content.data) : ""
  const { storageUrl } = await resolveTenantSettings({
    workspaceId: campaign.workspaceId,
  })

  // A redelivered webhook hits the sourceId dedup in the message upsert.
  await saveAndBroadcastMessage({
    inbox,
    contactInbox,
    conversation,
    storageUrl,
    // An echo of our own broadcast is not agent activity; keep it unread.
    keepUnread: true,
    incomingMessage: {
      sourceId: mid,
      messageType: "outgoing",
      contentType: "text",
      text: summary || FALLBACK_TEXT,
      contentAttributes: {
        metadata: { type: "marketingMessage", campaignRowId: campaign.id },
      },
    },
  })
}
