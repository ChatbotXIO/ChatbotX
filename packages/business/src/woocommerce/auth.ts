import {
  type WoocommerceAuthSecret,
  woocommerceAuthSecretSchema,
} from "@chatbotx.io/database/partials"
import type { IntegrationWoocommerceModel } from "@chatbotx.io/database/types"
import { encryptUtils } from "@chatbotx.io/encryption"
import type { WooCommerceCredentials } from "@chatbotx.io/integration-woocommerce"
import { checkSsrfSafety } from "../net/ssrf-guard"
import {
  woocommerceCredentialsInvalidException,
  woocommerceNotConnectedException,
} from "./errors"

/** Ties the encrypted secret to its workspace: copied elsewhere it does not decrypt. */
const authAad = (workspaceId: string) => `woocommerce:${workspaceId}`

export const encryptWooCommerceAuth = (
  workspaceId: string,
  secret: WoocommerceAuthSecret,
) => encryptUtils.encryptObject(secret, authAad(workspaceId))

export const decryptWooCommerceAuth = (
  row: Pick<IntegrationWoocommerceModel, "workspaceId" | "encryptedAuth">,
): Promise<WoocommerceAuthSecret> =>
  encryptUtils.decryptObject(
    row.encryptedAuth,
    woocommerceAuthSecretSchema,
    authAad(row.workspaceId),
  )

export const toWooCommerceCredentials = (
  siteUrl: string,
  secret: WoocommerceAuthSecret,
): WooCommerceCredentials => ({
  siteUrl,
  consumerKey: secret.consumerKey,
  consumerSecret: secret.consumerSecret,
  authMode: secret.authMode,
})

/**
 * The REST API credentials of the workspace's store. The address is checked
 * again before every use, not only on connect: a domain that later points at
 * a private address must not receive the keys or our requests.
 */
export const resolveWooCommerceCredentials = async (
  row: IntegrationWoocommerceModel | undefined,
): Promise<WooCommerceCredentials> => {
  if (!row) {
    throw woocommerceNotConnectedException()
  }
  if ((await checkSsrfSafety(row.siteUrl)).unsafe) {
    throw woocommerceCredentialsInvalidException(
      "the store address no longer points at a public website",
    )
  }
  return toWooCommerceCredentials(
    row.siteUrl,
    await decryptWooCommerceAuth(row),
  )
}
