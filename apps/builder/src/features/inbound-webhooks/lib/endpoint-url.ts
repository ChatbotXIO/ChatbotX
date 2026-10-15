/**
 * The URL an external system POSTs to. The token in the path is the only
 * credential, so the URL is built here and nowhere else (public API, UI copy
 * button, docs) and never logged.
 */
export const INBOUND_WEBHOOK_PATH_PREFIX = "/api/hooks/"

export const buildInboundWebhookUrl = (input: {
  origin: string
  token: string
}): string =>
  new URL(
    `${INBOUND_WEBHOOK_PATH_PREFIX}${input.token}`,
    input.origin,
  ).toString()
