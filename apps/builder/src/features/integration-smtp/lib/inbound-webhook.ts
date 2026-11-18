import { integrationSmtpService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  type InboundWebhookProvider,
  isInboundWebhookProvider,
  type SmtpAuthValue,
} from "@chatbotx.io/integration-smtp"
import { resolveTenantProviderOrigin } from "@/lib/provider-origin"
import type { InboundWebhookResource } from "../schema/resource"

/** What to switch on in the provider's dashboard, per provider. */
const PROVIDER_INSTRUCTIONS: Record<InboundWebhookProvider, string> = {
  sendgrid:
    "SendGrid > Settings > Inbound Parse > Add Host & URL: set your receiving domain's MX record, paste this URL as the destination and tick 'POST the raw, full MIME message' (needed for attachments).",
  mailgun:
    "Mailgun > Receiving > Create Route: expression `match_recipient('<your address>')`, action `forward('<this URL>')`. Mailgun posts the parsed message; use the `/messages.mime` form of the route to include attachments.",
  postmark:
    "Postmark > your server > Settings > Inbound: paste this URL as the Inbound Webhook, point your domain's MX at inbound.postmarkapp.com, and tick 'Include raw email content in JSON payload' for attachments.",
  brevo:
    "Brevo > Transactional > Settings > Inbound parsing: add a webhook with this URL for your receiving domain. Brevo posts the parsed message without attachments.",
}

export type InboundWebhookCommand = {
  workspaceId: string
  ownerId: string
  id: string
  /** Replace the token (invalidates the old URL) instead of reusing it. */
  rotate: boolean
}

export const resolveInboundWebhook = async (
  command: InboundWebhookCommand,
): Promise<InboundWebhookResource> => {
  const { workspaceId, ownerId, id, rotate } = command
  const integration = await integrationSmtpService.findByIdForWorkspace({
    id,
    workspaceId,
  })
  const { provider } = integration.auth as SmtpAuthValue
  if (!isInboundWebhookProvider(provider)) {
    throw new ChatbotXException(
      "Inbound webhooks are available for SendGrid, Mailgun, Postmark and Brevo. Use IMAP for mailbox providers.",
    )
  }

  const token = rotate
    ? await integrationSmtpService.rotateInboundToken({ workspaceId, id })
    : await integrationSmtpService.getOrCreateInboundToken({ workspaceId, id })
  const origin = await resolveTenantProviderOrigin(ownerId)

  return {
    provider,
    url: new URL(`/integrations/smtp/webhook/${token}`, origin).toString(),
    instructions: PROVIDER_INSTRUCTIONS[provider],
  }
}
