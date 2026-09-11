import { capText, logDiagnostic, redactSecrets } from "@chatbotx.io/logger"
import type { NextRequest } from "next/server"
import { logger } from "@/lib/log"

const MAX_REDACT_PARSE_CHARS = 65_536 // above this, skip parse to bound CPU

const omittedBody = (reason: string, length: number): string =>
  `[body omitted for safety: ${reason}, ${length} chars]`

/**
 * Turn a raw webhook body (a JSON string) into a log-safe string, reusing the
 * shared `redactSecrets` + `capText` helpers from `@chatbotx.io/logger`. Only
 * JSON small enough to parse is shown; anything we cannot safely redact —
 * non-JSON, oversized, or a redaction failure — is OMITTED (with its length as
 * a hint) rather than logged raw, so a secret can never leak through a fallback
 * path. This wrapper holds only the webhook-specific glue (a raw HTTP body is a
 * string that must be parsed first); the redaction/capping logic itself is
 * generic and shared for any other place that needs to debug-log safely.
 */
export const sanitizeWebhookBody = (body: string): string => {
  if (body.length > MAX_REDACT_PARSE_CHARS) {
    return omittedBody("too large to redact", body.length)
  }
  try {
    return capText(JSON.stringify(redactSecrets(JSON.parse(body))))
  } catch {
    return omittedBody("not valid JSON", body.length)
  }
}

/**
 * Logs an inbound channel webhook ("Webhook request body") so every channel's
 * traffic is observable the same way. The body — which contains customer
 * message content — is redacted (secrets stripped by key name) and capped in
 * size, then emitted at `debug` normally, or promoted to `info` when
 * `LOG_DEBUG=true` (see `logDiagnostic`). The INFO line always carries
 * metadata (including the ORIGINAL, uncapped content length) so production
 * logs stay free of message PII by default. Reads a CLONE of the request, so
 * the caller's own body consumption is unaffected. Never throws.
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
    logDiagnostic(
      logger,
      () => ({ integrationType, body: sanitizeWebhookBody(body) }),
      "Webhook request body payload",
    )
  } catch (e: unknown) {
    logger.info(
      { integrationType, err: e },
      "Failed to read webhook request body for logging",
    )
  }
}
