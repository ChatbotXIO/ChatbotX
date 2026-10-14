import "server-only"

import { verifyMiniAppToken } from "@chatbotx.io/encryption/mini-app-token"

/**
 * The contact behind a Mini App link, taken only from its signed
 * `{{mini_app_token}}`. A missing or invalid token, or one signed for another
 * workspace, yields `null`: the visitor is anonymous.
 */
export async function resolveVisitorContactId(input: {
  token?: string
  workspaceId: string
}): Promise<string | null> {
  const payload = input.token
    ? await verifyMiniAppToken(input.token).catch(() => null)
    : null
  return payload && payload.workspaceId === input.workspaceId
    ? payload.contactId
    : null
}
