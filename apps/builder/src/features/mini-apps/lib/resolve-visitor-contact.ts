import "server-only"

import {
  verifyMiniAppResumeToken,
  verifyMiniAppToken,
} from "@chatbotx.io/encryption/mini-app-token"

/**
 * The contact behind a Mini App link, taken only from its signed `token`. A
 * missing or invalid token, or one signed for another workspace, yields
 * `null`: the visitor is anonymous.
 *
 * The token is usually the contact's `{{mini_app_token}}`. A Messenger
 * template's Mini App button has room for one link suffix only, so when it is
 * sent from a flow the token is that button's `resume` token instead, which
 * names the contact as well — accepted here only for this Mini App.
 */
export async function resolveVisitorContactId(input: {
  token?: string
  workspaceId: string
  miniAppId: string
}): Promise<string | null> {
  if (!input.token) {
    return null
  }
  const contactToken = await verifyMiniAppToken(input.token).catch(() => null)
  if (contactToken) {
    return contactToken.workspaceId === input.workspaceId
      ? contactToken.contactId
      : null
  }
  const resumeToken = await verifyMiniAppResumeToken(input.token).catch(
    () => null,
  )
  return resumeToken?.workspaceId === input.workspaceId &&
    resumeToken.miniAppId === input.miniAppId
    ? resumeToken.contactId
    : null
}
