import type { NextRequest } from "next/server"
import { logger } from "@/lib/log"

/**
 * Logs an inbound channel webhook ("Webhook request body") so every channel's
 * traffic is observable the same way. The full raw body — which contains
 * customer message content — is only emitted at DEBUG level; the INFO line
 * carries metadata so production logs stay free of message PII. Reads a
 * CLONE of the request, so the caller's own body consumption is unaffected.
 * Never throws.
 */
export const logWebhookRequestBody = async (
  integrationType: string,
  req: NextRequest,
): Promise<void> => {
  try {
    const body = await req.clone().text()
    logger.info(
      { integrationType, contentLength: body.length },
      "Webhook request body",
    )
    logger.debug({ integrationType, body }, "Webhook request body payload")
  } catch (e: unknown) {
    logger.info(
      { integrationType, err: e },
      "Failed to read webhook request body for logging",
    )
  }
}
