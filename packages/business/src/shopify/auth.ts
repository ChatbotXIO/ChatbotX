import {
  type ShopifyAuthSecret,
  shopifyAuthSecretSchema,
} from "@chatbotx.io/database/partials"
import { shopifyRepository } from "@chatbotx.io/database/repositories"
import type { IntegrationShopifyModel } from "@chatbotx.io/database/types"
import { encryptUtils } from "@chatbotx.io/encryption"
import {
  requestShopifyAccessToken,
  type ShopifyCredentials,
} from "@chatbotx.io/integration-shopify"
import { distributedLock } from "@chatbotx.io/redis"
import { shopifyNotConnectedException } from "./errors"

/** Ties the encrypted secret to its workspace: copied elsewhere it does not decrypt. */
const authAad = (workspaceId: string) => `shopify:${workspaceId}`

/** A token this close to expiring is renewed before use. */
const TOKEN_RENEW_MARGIN_MS = 5 * 60 * 1000

export const encryptShopifyAuth = (
  workspaceId: string,
  secret: ShopifyAuthSecret,
) => encryptUtils.encryptObject(secret, authAad(workspaceId))

export const decryptShopifyAuth = (
  row: Pick<IntegrationShopifyModel, "workspaceId" | "encryptedAuth">,
): Promise<ShopifyAuthSecret> =>
  encryptUtils.decryptObject(
    row.encryptedAuth,
    shopifyAuthSecretSchema,
    authAad(row.workspaceId),
  )

/** The secret Shopify signs this store's webhooks with. */
export const webhookSecretOf = (secret: ShopifyAuthSecret) =>
  secret.kind === "token" ? secret.apiSecret : secret.clientSecret

const tokenStillGood = (expiresAt: string | null) =>
  Boolean(expiresAt) &&
  Date.parse(expiresAt as string) - Date.now() > TOKEN_RENEW_MARGIN_MS

/**
 * Exchanges client credentials for a fresh access token. Returns the secret
 * to store with the token cached on it.
 */
export const issueClientCredentialsToken = async (input: {
  shopDomain: string
  clientId: string
  clientSecret: string
}): Promise<Extract<ShopifyAuthSecret, { kind: "clientCredentials" }>> => {
  const issued = await requestShopifyAccessToken(input)
  return {
    kind: "clientCredentials",
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    accessToken: issued.accessToken,
    accessTokenExpiresAt: new Date(
      Date.now() + issued.expiresIn * 1000,
    ).toISOString(),
  }
}

/**
 * A working access token for the workspace's store. A Dev Dashboard app's
 * 24-hour token is renewed once it is about to run out; the renewal holds a
 * lock so two jobs do not both ask Shopify and race to save.
 */
export const resolveShopifyCredentials = async (
  row: IntegrationShopifyModel | undefined,
): Promise<ShopifyCredentials> => {
  if (!row) {
    throw shopifyNotConnectedException()
  }
  const secret = await decryptShopifyAuth(row)
  if (secret.kind === "token") {
    return { shopDomain: row.shopDomain, accessToken: secret.accessToken }
  }
  if (secret.accessToken && tokenStillGood(secret.accessTokenExpiresAt)) {
    return { shopDomain: row.shopDomain, accessToken: secret.accessToken }
  }

  return await distributedLock.runExclusive({
    key: `shopify-token:${row.workspaceId}`,
    timeoutInSeconds: 30,
    fn: async () => {
      // Another job may have renewed it while this one waited for the lock.
      const latest = await shopifyRepository.findIntegration(row.workspaceId)
      if (!latest) {
        throw shopifyNotConnectedException()
      }
      const current = await decryptShopifyAuth(latest)
      if (
        current.kind === "clientCredentials" &&
        current.accessToken &&
        tokenStillGood(current.accessTokenExpiresAt)
      ) {
        return {
          shopDomain: latest.shopDomain,
          accessToken: current.accessToken,
        }
      }
      if (current.kind === "token") {
        return {
          shopDomain: latest.shopDomain,
          accessToken: current.accessToken,
        }
      }
      const renewed = await issueClientCredentialsToken({
        shopDomain: latest.shopDomain,
        clientId: current.clientId,
        clientSecret: current.clientSecret,
      })
      await shopifyRepository.updateIntegration({
        workspaceId: latest.workspaceId,
        values: {
          encryptedAuth: await encryptShopifyAuth(latest.workspaceId, renewed),
        },
      })
      return {
        shopDomain: latest.shopDomain,
        accessToken: renewed.accessToken as string,
      }
    },
  })
}
