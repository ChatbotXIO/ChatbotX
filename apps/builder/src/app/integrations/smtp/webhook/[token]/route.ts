import { integrationSmtpService } from "@chatbotx.io/business"
import {
  isInboundWebhookProvider,
  type SmtpAuthValue,
} from "@chatbotx.io/integration-smtp"
import { SdkException } from "@chatbotx.io/sdk"
import { integrationQueue } from "@chatbotx.io/worker-config"
import type { NextRequest } from "next/server"
import { integrations } from "@/integration"
import { logger } from "@/lib/log"

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

/**
 * Inbound-parse endpoint for relay providers (SendGrid, Mailgun, Postmark,
 * Brevo). The unguessable token in the path is the only credential, so an
 * unknown token answers 404 and nothing about the request is logged.
 */
export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) => {
  const { token } = await params
  const row = token
    ? await integrationSmtpService.findByInboundToken(token)
    : null
  if (!row) {
    return json({ message: "Integration not found" }, 404)
  }

  const { provider } = row.auth as SmtpAuthValue
  if (!isInboundWebhookProvider(provider)) {
    return json({ message: "Provider does not support inbound webhooks" }, 400)
  }

  try {
    const result = await integrations.smtp.handleRequest({
      config: { inboxId: row.inboxId, provider },
      req,
      queue: integrationQueue,
    })
    return new Response(result as BodyInit)
  } catch (err: unknown) {
    logger.warn(
      { err, inboxId: row.inboxId, provider },
      "SMTP inbound webhook rejected",
    )
    const status = err instanceof SdkException ? err.httpStatusCode : 400
    return json(
      { message: err instanceof Error ? err.message : "Invalid request" },
      status,
    )
  }
}
