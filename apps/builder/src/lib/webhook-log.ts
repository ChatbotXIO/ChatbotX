import type { NextRequest } from "next/server"
import { logger } from "@/lib/log"

/**
 * Logs an inbound channel webhook's raw body ("Webhook request body") so
 * every channel's traffic is observable the same way. Reads a CLONE of the
 * request, so the caller's own body consumption is unaffected. Never throws.
 */
export const logWebhookRequestBody = async (
  integrationType: string,
  req: NextRequest,
): Promise<void> => {
  try {
    const body = await req.clone().text()
    logger.info({ integrationType, body }, "Webhook request body")
  } catch (e: unknown) {
    logger.info(
      { integrationType, err: e },
      "Failed to read webhook request body for logging",
    )
  }
}
