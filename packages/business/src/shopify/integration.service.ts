import {
  SHOPIFY_WEBHOOK_TOPICS,
  type ShopifyAuthSecret,
  type ShopifySyncScope,
  shopifyShopDomainSchema,
} from "@chatbotx.io/database/partials"
import {
  ecommerceSettingsRepository,
  shopifyRepository,
} from "@chatbotx.io/database/repositories"
import type { IntegrationShopifyModel } from "@chatbotx.io/database/types"
import {
  createShopifyWebhookSubscription,
  deleteShopifyWebhookSubscription,
  getShopifyShop,
  listShopifyWebhookSubscriptionIds,
  ShopifyApiError,
  type ShopifyCredentials,
  ShopifyUserError,
  shopifyAdminUrl,
} from "@chatbotx.io/integration-shopify"
import { joinAppUrl } from "@chatbotx.io/utils/web-url"
import {
  getShopifySyncJobId,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { BaseService } from "../base.service"
import { ecommerceSettingsCacheTag } from "../ecommerce-settings/store-source"
import { logger } from "../logger"
import { resolveWorkspaceAppUrl } from "../platform/settings"
import {
  decryptShopifyAuth,
  encryptShopifyAuth,
  issueClientCredentialsToken,
  resolveShopifyCredentials,
} from "./auth"
import {
  shopifyCredentialsInvalidException,
  shopifyNotConnectedException,
  shopifySyncInProgressException,
} from "./errors"

/** Turns a Shopify refusal during connect into the error the caller sees. */
const toShopifyConnectException = (error: unknown) => {
  // A missing scope (403) is a setup problem to fix before connecting too.
  if (
    error instanceof ShopifyApiError &&
    (error.unauthorized || error.statusCode === 403)
  ) {
    return shopifyCredentialsInvalidException(error.message)
  }
  if (error instanceof ShopifyApiError && error.statusCode === 404) {
    return shopifyCredentialsInvalidException("the store was not found")
  }
  if (error instanceof ShopifyUserError) {
    return shopifyCredentialsInvalidException(error.message)
  }
  return error
}

export const shopifyWebhookPath = (workspaceId: string) =>
  `/api/shopify/${encodeURIComponent(workspaceId)}/webhook`

/** What the builder and the public API show of a connection; never a secret. */
export type ShopifyConnectionView = {
  connected: true
  shopDomain: string
  shopName: string | null
  currency: string
  authKind: IntegrationShopifyModel["authKind"]
  status: IntegrationShopifyModel["status"]
  statusReason: string | null
  syncStatus: IntegrationShopifyModel["syncStatus"]
  syncError: string | null
  lastSyncedAt: Date | null
  productCount: number
  orderCount: number
  webhookUrl: string
  adminUrl: string
  connectedAt: Date
}

export type ShopifyStatusView =
  | ShopifyConnectionView
  | { connected: false; webhookUrl: string }

export type ShopifyConnectInput = {
  workspaceId: string
  shopDomain: string
} & (
  | { authKind: "token"; accessToken: string; apiSecret: string }
  | { authKind: "clientCredentials"; clientId: string; clientSecret: string }
)

const webhookUrlFor = async (workspaceId: string) =>
  joinAppUrl(
    await resolveWorkspaceAppUrl({ workspaceId }),
    shopifyWebhookPath(workspaceId),
  )

const toView = (
  row: IntegrationShopifyModel,
  webhookUrl: string,
): ShopifyConnectionView => ({
  connected: true,
  shopDomain: row.shopDomain,
  shopName: row.shopName,
  currency: row.currency,
  authKind: row.authKind,
  status: row.status,
  statusReason: row.statusReason,
  syncStatus: row.syncStatus,
  syncError: row.syncError,
  lastSyncedAt: row.lastSyncedAt,
  productCount: row.productCount,
  orderCount: row.orderCount,
  webhookUrl,
  adminUrl: shopifyAdminUrl(row.shopDomain),
  connectedAt: row.createdAt,
})

const RUNNING_SYNC_STATUSES = new Set(["queued", "running"])

/** A queued or running sync older than this is treated as dead. */
const STALE_SYNC_MS = 30 * 60 * 1000

class ShopifyIntegrationService extends BaseService {
  async getStatus(workspaceId: string): Promise<ShopifyStatusView> {
    const [row, webhookUrl] = await Promise.all([
      shopifyRepository.findIntegration(workspaceId),
      webhookUrlFor(workspaceId),
    ])
    return row ? toView(row, webhookUrl) : { connected: false, webhookUrl }
  }

  /** The connection row, or a `shopifyNotConnected` error. */
  async require(workspaceId: string): Promise<IntegrationShopifyModel> {
    const row = await shopifyRepository.findIntegration(workspaceId)
    if (!row) {
      throw shopifyNotConnectedException()
    }
    return row
  }

  async credentials(workspaceId: string): Promise<ShopifyCredentials> {
    return await resolveShopifyCredentials(
      await shopifyRepository.findIntegration(workspaceId),
    )
  }

  /**
   * Checks the credentials against the store, subscribes our webhook URL to
   * every topic we mirror, saves the connection encrypted and queues a full
   * sync. Connecting again replaces the previous connection and its
   * subscriptions. The store source is left as it is: the merchant switches
   * it in General once the sync has run.
   */
  async connect(input: ShopifyConnectInput): Promise<ShopifyConnectionView> {
    const shopDomain = shopifyShopDomainSchema.parse(input.shopDomain)
    let secret: ShopifyAuthSecret
    try {
      secret =
        input.authKind === "token"
          ? {
              kind: "token",
              accessToken: input.accessToken.trim(),
              apiSecret: input.apiSecret.trim(),
            }
          : await issueClientCredentialsToken({
              shopDomain,
              clientId: input.clientId.trim(),
              clientSecret: input.clientSecret.trim(),
            })
    } catch (error) {
      throw toShopifyConnectException(error)
    }
    const credentials: ShopifyCredentials = {
      shopDomain,
      accessToken: secret.accessToken as string,
    }

    let shop: Awaited<ReturnType<typeof getShopifyShop>>
    try {
      shop = await getShopifyShop(credentials)
    } catch (error) {
      throw toShopifyConnectException(error)
    }

    const previous = await shopifyRepository.findIntegration(input.workspaceId)
    const webhookUrl = await webhookUrlFor(input.workspaceId)
    const subscriptionIds: string[] = []
    try {
      // Ours already on the store (a reconnect, or a connect that stopped
      // half way) would make Shopify refuse the same address again.
      await this.removeSubscriptionsQuietly(
        credentials,
        await listShopifyWebhookSubscriptionIds(credentials, webhookUrl),
      )
      for (const topic of SHOPIFY_WEBHOOK_TOPICS) {
        subscriptionIds.push(
          await createShopifyWebhookSubscription(credentials, {
            topic,
            uri: webhookUrl,
          }),
        )
      }
    } catch (error) {
      await this.removeSubscriptionsQuietly(credentials, subscriptionIds)
      throw toShopifyConnectException(error)
    }

    let row: IntegrationShopifyModel | undefined
    try {
      row = await shopifyRepository.upsertIntegration({
        workspaceId: input.workspaceId,
        values: {
          shopDomain,
          shopName: shop.name,
          currency: shop.currencyCode,
          authKind: secret.kind,
          encryptedAuth: await encryptShopifyAuth(input.workspaceId, secret),
          webhookSubscriptionIds: subscriptionIds,
          status: "active",
          statusReason: null,
          syncStatus: "idle",
          syncError: null,
          productCount: 0,
          orderCount: 0,
        },
      })
    } catch (error) {
      await this.removeSubscriptionsQuietly(credentials, subscriptionIds)
      throw error
    }
    if (!row) {
      await this.removeSubscriptionsQuietly(credentials, subscriptionIds)
      throw new Error("Failed to save the Shopify connection")
    }

    // The old connection's subscriptions would keep calling us.
    if (previous) {
      await this.removePreviousSubscriptionsQuietly(previous)
    }
    await this.audit("connect", `connected Shopify store ${shopDomain}`)
    await this.requestSync({ workspaceId: input.workspaceId, scope: "all" })
    const saved = await shopifyRepository.findIntegration(input.workspaceId)
    return toView(saved ?? row, webhookUrl)
  }

  /**
   * Queues a sync unless one is running. A sync that has been "running" for
   * half an hour died with its worker and no longer blocks a new one.
   */
  async requestSync(input: {
    workspaceId: string
    scope: ShopifySyncScope
  }): Promise<ShopifyConnectionView> {
    const row = await this.require(input.workspaceId)
    const stale = Date.now() - row.updatedAt.getTime() > STALE_SYNC_MS
    if (RUNNING_SYNC_STATUSES.has(row.syncStatus) && !stale) {
      throw shopifySyncInProgressException()
    }
    await shopifyRepository.updateIntegration({
      workspaceId: input.workspaceId,
      values: { syncStatus: "queued", syncError: null },
    })
    const requestedAt = new Date()
    try {
      await integrationQueue.add(
        IntegrationJobAction.shopifySync,
        {
          type: IntegrationJobAction.shopifySync,
          data: { workspaceId: input.workspaceId, scope: input.scope },
        },
        {
          jobId: getShopifySyncJobId(
            input.workspaceId,
            input.scope,
            requestedAt,
          ),
        },
      )
    } catch (error) {
      // Not left "queued" forever, or no later sync could start.
      await shopifyRepository.updateIntegration({
        workspaceId: input.workspaceId,
        values: {
          syncStatus: "failed",
          syncError: "Could not queue the sync.",
        },
      })
      throw error
    }
    const updated = await this.require(input.workspaceId)
    return toView(updated, await webhookUrlFor(input.workspaceId))
  }

  /**
   * Disconnects: Shopify stops calling us (best effort), the connection is
   * removed and the store goes back to its own catalog. The mirrored
   * products and orders stay, hidden, so reconnecting later finds them.
   */
  async disconnect(workspaceId: string): Promise<void> {
    const row = await shopifyRepository.findIntegration(workspaceId)
    if (!row) {
      return
    }
    await this.removePreviousSubscriptionsQuietly(row)
    await shopifyRepository.deleteIntegration(workspaceId)
    await this.switchStoreBackToChatbotx(workspaceId)
    await this.audit(
      "disconnect",
      `disconnected Shopify store ${row.shopDomain}`,
    )
  }

  /**
   * Shopify says the app was uninstalled, or refused the credentials: the
   * subscriptions are already gone, so the connection is only marked.
   */
  async markInvalid(workspaceId: string, reason: string): Promise<void> {
    await shopifyRepository.updateIntegration({
      workspaceId,
      values: { status: "invalid", statusReason: reason },
    })
  }

  /** A workspace being purged: Shopify stops calling us, best effort. */
  async teardownForPurge(workspaceId: string): Promise<void> {
    const row = await shopifyRepository.findIntegration(workspaceId)
    if (row) {
      await this.removePreviousSubscriptionsQuietly(row)
    }
  }

  private async switchStoreBackToChatbotx(workspaceId: string) {
    await ecommerceSettingsRepository.setStoreSource({
      workspaceId,
      storeSource: "chatbotx",
    })
    await this.invalidateCacheTags(ecommerceSettingsCacheTag(workspaceId))
  }

  private async removePreviousSubscriptionsQuietly(
    row: IntegrationShopifyModel,
  ) {
    try {
      const credentials = await resolveShopifyCredentials(row)
      await this.removeSubscriptionsQuietly(
        credentials,
        row.webhookSubscriptionIds,
      )
    } catch (err) {
      logger.warn(
        { err, workspaceId: row.workspaceId },
        "[shopify] could not reach the store to remove its webhooks",
      )
    }
  }

  private async removeSubscriptionsQuietly(
    credentials: ShopifyCredentials,
    subscriptionIds: string[],
  ) {
    for (const id of subscriptionIds) {
      try {
        await deleteShopifyWebhookSubscription(credentials, id)
      } catch (err) {
        logger.warn(
          { err, subscriptionId: id },
          "[shopify] could not remove a webhook subscription",
        )
      }
    }
  }

  /** The secret to verify a webhook with, or null when not connected. */
  async webhookSecret(workspaceId: string): Promise<string | null> {
    const row = await shopifyRepository.findIntegration(workspaceId)
    if (!row) {
      return null
    }
    const secret = await decryptShopifyAuth(row)
    return secret.kind === "token" ? secret.apiSecret : secret.clientSecret
  }
}

export const shopifyIntegrationService = new ShopifyIntegrationService()
