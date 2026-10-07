import { getBrokerOrigin } from "@/lib/oauth-broker"

/**
 * The public link of a Mini App, shared by the table's "Copy link" and the
 * public API. `{{mini_app_token}}` is a contact variable: sent from a flow it
 * becomes a signed token naming the contact, which is how a submission is
 * attributed. Opened without it, the Mini App still works anonymously.
 */
export const buildMiniAppPublicUrl = (miniAppId: string): string =>
  `${getBrokerOrigin()}/mini-apps?id=${miniAppId}&token={{mini_app_token}}`
