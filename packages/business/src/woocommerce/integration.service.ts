import {
  WOOCOMMERCE_WEBHOOK_TOPICS,
  type WoocommerceAuthMode,
  type WoocommerceAuthSecret,
  type WoocommerceSyncScope,
  woocommerceSiteUrlSchema,
} from "@chatbotx.io/database/partials"
import { woocommerceRepository } from "@chatbotx.io/database/repositories"
import type { IntegrationWoocommerceModel } from "@chatbotx.io/database/types"
import {
  activateWooCommerceWebhook,
  createWooCommerceWebhook,
  deleteWooCommerceWebhook,
  getWooCommerceStoreInfo,
  listWooCommerceWebhooks,
  WooCommerceApiError,
  type WooCommerceCredentials,
  type WooCommerceStoreInfo,
  woocommerceAdminUrl,
} from "@chatbotx.io/integration-woocommerce"
import { joinAppUrl } from "@chatbotx.io/utils/web-url"
import {
  getWoocommerceSyncJobId,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { BaseService } from "../base.service"
import {
  adoptExternalStoreCurrency,
  ecommerceSettingsCacheTag,
  switchStoreBackFrom,
} from "../ecommerce-settings/store-source"
import { logger } from "../logger"
import { checkSsrfSafety } from "../net/ssrf-guard"
import { resolveWorkspaceAppUrl } from "../platform/settings"
import {
  decryptWooCommerceAuth,
  encryptWooCommerceAuth,
  resolveWooCommerceCredentials,
  toWooCommerceCredentials,
} from "./auth"
import {
  woocommerceCredentialsInvalidException,
  woocommerceNotConnectedException,
  woocommerceSyncInProgressException,
} from "./errors"

/** Turns a refusal during connect into the error the caller sees. */
const toWooCommerceConnectException = (error: unknown) => {
  if (error instanceof WooCommerceApiError && error.statusCode < 500) {
    return woocommerceCredentialsInvalidException(error.message)
  }
  return error
}

export const woocommerceWebhookPath = (workspaceId: string) =>
  `/api/woocommerce/${encodeURIComponent(workspaceId)}/webhook`

/** What the builder and the public API show of a connection; never a secret. */
export type WooCommerceConnectionView = {
  connected: true
  siteUrl: string
  storeName: string | null
  currency: string
  /** The first characters of the consumer key, to tell keys apart. */
  consumerKeyHint: string
  status: IntegrationWoocommerceModel["status"]
  statusReason: string | null
  syncStatus: IntegrationWoocommerceModel["syncStatus"]
  syncError: string | null
  lastSyncedAt: Date | null
  productCount: number
  orderCount: number
  webhookUrl: string
  adminUrl: string
  connectedAt: Date
}

export type WooCommerceStatusView =
  | WooCommerceConnectionView
  | { connected: false; webhookUrl: string }

export type WooCommerceConnectInput = {
  workspaceId: string
  siteUrl: string
  consumerKey: string
  consumerSecret: string
}

const webhookUrlFor = async (workspaceId: string) =>
  joinAppUrl(
    await resolveWorkspaceAppUrl({ workspaceId }),
    woocommerceWebhookPath(workspaceId),
  )

const CONSUMER_KEY_HINT_LENGTH = 7

const toView = async (
  row: IntegrationWoocommerceModel,
  webhookUrl: string,
): Promise<WooCommerceConnectionView> => {
  const secret = await decryptWooCommerceAuth(row)
  return {
    connected: true,
    siteUrl: row.siteUrl,
    storeName: row.storeName,
    currency: row.currency,
    consumerKeyHint: `${secret.consumerKey.slice(0, CONSUMER_KEY_HINT_LENGTH)}…`,
    status: row.status,
    statusReason: row.statusReason,
    syncStatus: row.syncStatus,
    syncError: row.syncError,
    lastSyncedAt: row.lastSyncedAt,
    productCount: row.productCount,
    orderCount: row.orderCount,
    webhookUrl,
    adminUrl: woocommerceAdminUrl(row.siteUrl),
    connectedAt: row.createdAt,
  }
}

const RUNNING_SYNC_STATUSES = new Set(["queued", "running"])

/** A queued or running sync older than this is treated as dead. */
const STALE_SYNC_MS = 30 * 60 * 1000

const WEBHOOK_SECRET_BYTES = 32

/** A fresh secret for WooCommerce to sign our webhooks with. */
const generateWebhookSecret = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(WEBHOOK_SECRET_BYTES)))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")

/**
 * The keys work against the store: Basic auth first, then — for a host that
 * strips the `Authorization` header and answers 401 — the keys in the query
 * string. Returns the mode that worked and the store's details.
 */
const probeStore = async (input: {
  siteUrl: string
  consumerKey: string
  consumerSecret: string
}): Promise<{ authMode: WoocommerceAuthMode; info: WooCommerceStoreInfo }> => {
  try {
    const info = await getWooCommerceStoreInfo({ ...input, authMode: "header" })
    return { authMode: "header", info }
  } catch (error) {
    if (!(error instanceof WooCommerceApiError && error.unauthorized)) {
      throw error
    }
  }
  const info = await getWooCommerceStoreInfo({ ...input, authMode: "query" })
  return { authMode: "query", info }
}

class WooCommerceIntegrationService extends BaseService {
  async getStatus(workspaceId: string): Promise<WooCommerceStatusView> {
    const [row, webhookUrl] = await Promise.all([
      woocommerceRepository.findIntegration(workspaceId),
      webhookUrlFor(workspaceId),
    ])
    return row
      ? await toView(row, webhookUrl)
      : { connected: false, webhookUrl }
  }

  /** The connection row, or a `woocommerceNotConnected` error. */
  async require(workspaceId: string): Promise<IntegrationWoocommerceModel> {
    const row = await woocommerceRepository.findIntegration(workspaceId)
    if (!row) {
      throw woocommerceNotConnectedException()
    }
    return row
  }

  async credentials(workspaceId: string): Promise<WooCommerceCredentials> {
    return await resolveWooCommerceCredentials(
      await woocommerceRepository.findIntegration(workspaceId),
    )
  }

  /**
   * Checks the keys against the store, registers our webhook URL for every
   * topic we mirror (signed with a secret generated here), saves the
   * connection encrypted and queues a full sync. Connecting again replaces
   * the previous connection and its webhooks. The store source is left as it
   * is: the merchant switches it in General once the sync has run.
   */
  async connect(
    input: WooCommerceConnectInput,
  ): Promise<WooCommerceConnectionView> {
    const parsedUrl = woocommerceSiteUrlSchema.safeParse(input.siteUrl)
    if (!parsedUrl.success) {
      throw woocommerceCredentialsInvalidException(
        parsedUrl.error.issues[0]?.message ?? "the store address is not valid",
      )
    }
    const siteUrl = parsedUrl.data
    // The keys and every later call go to this address from our servers.
    if ((await checkSsrfSafety(siteUrl)).unsafe) {
      throw woocommerceCredentialsInvalidException(
        "the store address must be a public website",
      )
    }
    const keys = {
      siteUrl,
      consumerKey: input.consumerKey.trim(),
      consumerSecret: input.consumerSecret.trim(),
    }

    let probed: Awaited<ReturnType<typeof probeStore>>
    try {
      probed = await probeStore(keys)
    } catch (error) {
      throw toWooCommerceConnectException(error)
    }
    const secret: WoocommerceAuthSecret = {
      consumerKey: keys.consumerKey,
      consumerSecret: keys.consumerSecret,
      webhookSecret: generateWebhookSecret(),
      authMode: probed.authMode,
    }
    const credentials = toWooCommerceCredentials(siteUrl, secret)

    const previous = await woocommerceRepository.findIntegration(
      input.workspaceId,
    )
    const webhookUrl = await webhookUrlFor(input.workspaceId)
    const webhookIds: string[] = []
    // Ours already on the store (a reconnect, or a connect that stopped half
    // way) would deliver twice. They are removed only once the new ones are
    // registered and saved: a connect failing half way keeps the working
    // connection and its webhooks.
    let staleWebhookIds: string[]
    try {
      staleWebhookIds = (
        await listWooCommerceWebhooks(credentials, webhookUrl)
      ).map((webhook) => String(webhook.id))
    } catch (error) {
      throw toWooCommerceConnectException(error)
    }
    try {
      for (const topic of WOOCOMMERCE_WEBHOOK_TOPICS) {
        webhookIds.push(
          await createWooCommerceWebhook(credentials, {
            name: `ChatbotX ${topic}`,
            topic,
            deliveryUrl: webhookUrl,
            secret: secret.webhookSecret,
          }),
        )
      }
    } catch (error) {
      await this.removeWebhooksQuietly(credentials, webhookIds)
      throw toWooCommerceConnectException(error)
    }

    let row: IntegrationWoocommerceModel | undefined
    try {
      row = await woocommerceRepository.upsertIntegration({
        workspaceId: input.workspaceId,
        values: {
          siteUrl,
          storeName: probed.info.name,
          currency: probed.info.currency,
          encryptedAuth: await encryptWooCommerceAuth(
            input.workspaceId,
            secret,
          ),
          webhookIds,
          status: "active",
          statusReason: null,
          syncStatus: "idle",
          syncError: null,
          productCount: 0,
          orderCount: 0,
        },
      })
    } catch (error) {
      await this.removeWebhooksQuietly(credentials, webhookIds)
      throw error
    }
    if (!row) {
      await this.removeWebhooksQuietly(credentials, webhookIds)
      throw new Error("Failed to save the WooCommerce connection")
    }

    // The old webhooks (an earlier connection to this store, or another
    // store) would keep calling us with a secret we no longer know.
    await this.removeWebhooksQuietly(credentials, staleWebhookIds)
    if (previous && previous.siteUrl !== siteUrl) {
      await this.removePreviousWebhooksQuietly(previous)
    }
    await this.audit("connect", `connected WooCommerce store ${siteUrl}`)
    return await this.requestSync({
      workspaceId: input.workspaceId,
      scope: "all",
    })
  }

  /**
   * Queues a sync unless one is running. A sync that has been "running" for
   * half an hour died with its worker and no longer blocks a new one. Also
   * turns back on any of our webhooks WooCommerce disabled after failed
   * deliveries, so changes reach us again.
   */
  async requestSync(input: {
    workspaceId: string
    scope: WoocommerceSyncScope
  }): Promise<WooCommerceConnectionView> {
    const row = await this.require(input.workspaceId)
    const stale = Date.now() - row.updatedAt.getTime() > STALE_SYNC_MS
    if (RUNNING_SYNC_STATUSES.has(row.syncStatus) && !stale) {
      throw woocommerceSyncInProgressException()
    }
    await this.reactivateWebhooksQuietly(row)
    await woocommerceRepository.updateIntegration({
      workspaceId: input.workspaceId,
      values: { syncStatus: "queued", syncError: null },
    })
    const requestedAt = new Date()
    try {
      await integrationQueue.add(
        IntegrationJobAction.woocommerceSync,
        {
          type: IntegrationJobAction.woocommerceSync,
          data: { workspaceId: input.workspaceId, scope: input.scope },
        },
        {
          jobId: getWoocommerceSyncJobId(
            input.workspaceId,
            input.scope,
            requestedAt,
          ),
        },
      )
    } catch (error) {
      // Not left "queued" forever, or no later sync could start.
      await woocommerceRepository.updateIntegration({
        workspaceId: input.workspaceId,
        values: {
          syncStatus: "failed",
          syncError: "Could not queue the sync.",
        },
      })
      throw error
    }
    const updated = await this.require(input.workspaceId)
    return await toView(updated, await webhookUrlFor(input.workspaceId))
  }

  /**
   * Disconnects: the store stops calling us (best effort), the connection is
   * removed and a store selling from WooCommerce goes back to its own
   * catalog. The mirrored products and orders stay, hidden, so reconnecting
   * later finds them.
   */
  async disconnect(workspaceId: string): Promise<void> {
    const row = await woocommerceRepository.findIntegration(workspaceId)
    if (!row) {
      return
    }
    await this.removePreviousWebhooksQuietly(row)
    await woocommerceRepository.deleteIntegration(workspaceId)
    await switchStoreBackFrom(workspaceId, "woocommerce")
    await this.invalidateCacheTags(ecommerceSettingsCacheTag(workspaceId))
    await this.audit(
      "disconnect",
      `disconnected WooCommerce store ${row.siteUrl}`,
    )
  }

  /**
   * Reads the store's currency again — code, symbol and where the symbol
   * goes, as WooCommerce shows prices — and, while the store sells from
   * WooCommerce, makes it the store's currency here. Runs with every sync and
   * right after the store switches to WooCommerce.
   */
  async refreshStoreCurrency(workspaceId: string): Promise<void> {
    const row = await woocommerceRepository.findIntegration(workspaceId)
    if (row?.status !== "active") {
      return
    }
    const info = await getWooCommerceStoreInfo(
      await resolveWooCommerceCredentials(row),
    )
    if (info.currency !== row.currency || info.name !== row.storeName) {
      await woocommerceRepository.updateIntegration({
        workspaceId,
        values: { currency: info.currency, storeName: info.name },
      })
    }
    await adoptExternalStoreCurrency({
      workspaceId,
      source: "woocommerce",
      currency: info.currency,
      currencySymbol: info.currencySymbol,
      currencyPosition: info.currencyPosition,
    })
  }

  /** The store refused the keys: the connection is only marked. */
  async markInvalid(workspaceId: string, reason: string): Promise<void> {
    await woocommerceRepository.updateIntegration({
      workspaceId,
      values: { status: "invalid", statusReason: reason },
    })
  }

  /** A workspace being purged: the store stops calling us, best effort. */
  async teardownForPurge(workspaceId: string): Promise<void> {
    const row = await woocommerceRepository.findIntegration(workspaceId)
    if (row) {
      await this.removePreviousWebhooksQuietly(row)
    }
  }

  /** The secret our webhooks are signed with, or null when not connected. */
  async webhookSecret(workspaceId: string): Promise<string | null> {
    const row = await woocommerceRepository.findIntegration(workspaceId)
    if (!row) {
      return null
    }
    return (await decryptWooCommerceAuth(row)).webhookSecret
  }

  private async reactivateWebhooksQuietly(row: IntegrationWoocommerceModel) {
    try {
      const credentials = await resolveWooCommerceCredentials(row)
      const ours = await listWooCommerceWebhooks(
        credentials,
        await webhookUrlFor(row.workspaceId),
      )
      for (const webhook of ours) {
        if (webhook.status !== "active") {
          await activateWooCommerceWebhook(credentials, String(webhook.id))
        }
      }
    } catch (err) {
      logger.warn(
        { err, workspaceId: row.workspaceId },
        "[woocommerce] could not turn the store's webhooks back on",
      )
    }
  }

  private async removePreviousWebhooksQuietly(
    row: IntegrationWoocommerceModel,
  ) {
    try {
      const credentials = await resolveWooCommerceCredentials(row)
      await this.removeWebhooksQuietly(credentials, row.webhookIds)
    } catch (err) {
      logger.warn(
        { err, workspaceId: row.workspaceId },
        "[woocommerce] could not reach the store to remove its webhooks",
      )
    }
  }

  private async removeWebhooksQuietly(
    credentials: WooCommerceCredentials,
    webhookIds: string[],
  ) {
    for (const id of webhookIds) {
      try {
        await deleteWooCommerceWebhook(credentials, id)
      } catch (err) {
        logger.warn(
          { err, webhookId: id },
          "[woocommerce] could not remove a webhook",
        )
      }
    }
  }
}

export const wooCommerceIntegrationService = new WooCommerceIntegrationService()
