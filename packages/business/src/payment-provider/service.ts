import {
  type DatabaseClient,
  db,
  isUniqueViolationError,
} from "@chatbotx.io/database/client"
import type { OnlinePaymentProvider } from "@chatbotx.io/database/partials"
import {
  orderPaymentRepository,
  paymentProviderRepository,
} from "@chatbotx.io/database/repositories"
import type { EcommercePaymentProviderModel } from "@chatbotx.io/database/types"
import { encryptUtils } from "@chatbotx.io/encryption"
import {
  buildStripeAuthorizeUrl,
  connectPaypal,
  createPaypalGateway,
  createStripeAccountWebhook,
  createStripeGateway,
  deauthorizeStripe,
  deleteStripeAccountWebhook,
  disconnectPaypal,
  exchangeStripeCode,
  isStripeSecretKey,
  type PaymentGateway,
  type PaypalSecret,
  readStripeAccount,
  readStripeKeyAccount,
  type StripeKeySecret,
} from "@chatbotx.io/payments"
import { distributedLock, distributedStore } from "@chatbotx.io/redis"
import { joinAppUrl } from "@chatbotx.io/utils/web-url"
import { z } from "zod"
import { BaseService } from "../base.service"
import { ecommerceSettingsService } from "../ecommerce-settings/service"
import { logger } from "../logger"
import { resolveWorkspaceAppUrl } from "../platform/settings"
import { platformCredentialService } from "../platform-credential/service"
import {
  paymentProviderInUseException,
  paymentProviderNotConnectedException,
  stripeAccountAlreadyConnectedException,
  stripePlatformNotConfiguredException,
  stripeSecretKeyInvalidException,
  toPaymentProviderException,
} from "./errors"

/** The decrypted PayPal secret, checked before use. */
const paypalSecretSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  livemode: z.boolean(),
  webhookId: z.string().min(1),
}) satisfies z.ZodType<PaypalSecret>

/** Ties an encrypted PayPal secret to its workspace: copied to another row it does not decrypt. */
const paypalSecretAad = (workspaceId: string) =>
  `ecommerce-payment:${workspaceId}:paypal`

/** The decrypted Stripe key connection, checked before use. */
const stripeKeySecretSchema = z.object({
  secretKey: z.string().min(1),
  livemode: z.boolean(),
  accountId: z.string().min(1),
  webhookId: z.string().min(1),
  webhookSecret: z.string().min(1),
}) satisfies z.ZodType<StripeKeySecret>

/** Ties an encrypted Stripe key to its workspace: copied to another row it does not decrypt. */
const stripeKeySecretAad = (workspaceId: string) =>
  `ecommerce-payment:${workspaceId}:stripe`

/**
 * A Stripe row connected with the store's own key rather than through
 * Stripe Connect: it holds the encrypted key and no platform app.
 */
const isStripeKeyRow = (
  row: Pick<EcommercePaymentProviderModel, "provider" | "secret">,
) => row.provider === "stripe" && Boolean(row.secret)

/**
 * Whether a new Stripe connection is another account than the row's — or the
 * same account in the other mode: a test key cannot read, close or refund a
 * live session, nor a live key a test one.
 */
const changesStripeAccount = (
  previous: Pick<
    EcommercePaymentProviderModel,
    "externalAccountId" | "livemode"
  >,
  next: { accountId: string; livemode: boolean },
) =>
  previous.externalAccountId !== next.accountId ||
  previous.livemode !== next.livemode

/**
 * One Stripe connect at a time per workspace: two at once (a double submit,
 * the API and the UI) would each create a webhook and keep only one.
 */
const STRIPE_CONNECT_LOCK_SECONDS = 90
const stripeConnectLockKey = (workspaceId: string) =>
  `payment-provider-connect:${workspaceId}:stripe`

/** `AbCd…wxyz`: enough to recognise the app, never the whole id. */
const maskClientId = (clientId: string) =>
  clientId.length <= 8
    ? "••••"
    : `${clientId.slice(0, 4)}…${clientId.slice(-4)}`

/**
 * How a provider was connected: `oauth` through the platform's Stripe Connect
 * app, `apiKey` with the store's own keys (a Stripe secret key, or PayPal's
 * Client ID and Secret).
 */
export type PaymentProviderConnectionType = "oauth" | "apiKey"

/** A connection as the settings page and the API show it: never a secret. */
export type PaymentProviderView = {
  provider: OnlinePaymentProvider
  connectionType: PaymentProviderConnectionType
  livemode: boolean
  /** The Stripe account's name, or the masked PayPal Client ID. */
  accountLabel: string | null
  /** Stripe's `acct_…`; null for PayPal. */
  accountId: string | null
  connectedAt: Date
}

const toView = (row: EcommercePaymentProviderModel): PaymentProviderView => ({
  provider: row.provider,
  connectionType:
    row.provider === "stripe" && !isStripeKeyRow(row) ? "oauth" : "apiKey",
  livemode: row.livemode,
  accountLabel: row.accountLabel,
  accountId: row.externalAccountId,
  connectedAt: row.createdAt,
})

/** The platform's Stripe Connect app a store connects through. */
export type StripePlatform = {
  credentialId: string
  /** The reseller who owns the app; null for the platform's own. */
  userId: string | null
  secretKey: string
  clientId: string
}

/** What a Stripe connect in progress remembers until its callback. */
export type StripeConnectState = {
  workspaceId: string
  platformCredentialId: string
  returnTo: string
  /**
   * The member who pressed Connect. Only they can finish it: a callback URL
   * someone else approved with their own Stripe account and passed on
   * cannot connect that account to this workspace.
   */
  userId: string
}

const STRIPE_CONNECT_STATE_TTL_SECONDS = 15 * 60
const STRIPE_CONNECT_STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/
const stripeConnectStateKey = (state: string) => `stripe-connect:${state}`

const BASE64_PLUS = /\+/g
const BASE64_SLASH = /\//g
const BASE64_PADDING = /=+$/

/**
 * 32 random bytes as base64url (43 characters), from Web Crypto: this module
 * is reached by the Edge-safe business barrel, so no `node:crypto`.
 */
const randomState = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
    .replace(BASE64_PLUS, "-")
    .replace(BASE64_SLASH, "_")
    .replace(BASE64_PADDING, "")
}

/**
 * The webhook URL a store's PayPal app calls back on: the workspace's own
 * domain (a reseller's active custom domain), so the store owner never sees
 * the platform's in their PayPal dashboard.
 */
const workspaceWebhookUrl = async (workspaceId: string, path: string) => {
  const appUrl = await resolveWorkspaceAppUrl({ workspaceId })
  return joinAppUrl(appUrl, path)
}

export const paypalWebhookPath = (workspaceId: string) =>
  `/api/payments/paypal/${encodeURIComponent(workspaceId)}/webhook`

export const stripeAccountWebhookPath = (workspaceId: string) =>
  `/api/payments/stripe/workspace/${encodeURIComponent(workspaceId)}/webhook`

export const stripeConnectWebhookPath = (platformCredentialId: string) =>
  `/api/payments/stripe/webhook/${encodeURIComponent(platformCredentialId)}`

class PaymentProviderService extends BaseService {
  async list(workspaceId: string): Promise<PaymentProviderView[]> {
    const rows = await paymentProviderRepository.listByWorkspace(workspaceId)
    return rows.map(toView)
  }

  /**
   * The platform's Stripe Connect app for a workspace owner: a reseller's own
   * when it has one, the platform's otherwise. Both the secret key and the
   * Connect client id are needed.
   */
  async resolveStripePlatform(ownerId: string): Promise<StripePlatform> {
    const credential = await platformCredentialService.resolveForOwner({
      ownerId,
      type: "stripe",
    })
    const secretKey = credential?.config.secretKey
    const clientId = credential?.config.connectClientId
    if (!(credential && secretKey && clientId)) {
      throw stripePlatformNotConfiguredException()
    }
    return {
      credentialId: credential.id,
      userId: credential.userId,
      secretKey,
      clientId,
    }
  }

  /** Whether the owner's platform can connect Stripe stores at all. */
  async isStripeAvailable(ownerId: string): Promise<boolean> {
    try {
      await this.resolveStripePlatform(ownerId)
      return true
    } catch {
      return false
    }
  }

  /**
   * The Stripe page the store owner connects their account on. Its `state`
   * is a random single-use key held server-side for 15 minutes, naming the
   * workspace and the platform app; the callback takes it (atomically), so
   * the code is exchanged at most once and a `state` cannot be made up.
   * `returnTo` is where the callback lands afterwards.
   */
  async createStripeConnectLink(input: {
    workspaceId: string
    userId: string
    platform: StripePlatform
    redirectUri: string
    returnTo: string
    email?: string | null
  }): Promise<{ url: string; expiresAt: Date }> {
    const state = randomState()
    const pending: StripeConnectState = {
      workspaceId: input.workspaceId,
      platformCredentialId: input.platform.credentialId,
      returnTo: input.returnTo,
      userId: input.userId,
    }
    await distributedStore.put(
      stripeConnectStateKey(state),
      pending,
      STRIPE_CONNECT_STATE_TTL_SECONDS,
    )
    return {
      url: buildStripeAuthorizeUrl({
        clientId: input.platform.clientId,
        redirectUri: input.redirectUri,
        state,
        email: input.email,
      }),
      expiresAt: new Date(Date.now() + STRIPE_CONNECT_STATE_TTL_SECONDS * 1000),
    }
  }

  /**
   * Where a callback's connect came from, without using it up — only to send
   * the callback back to the host the store owner started on (their session
   * lives there) before the `state` is taken.
   */
  async peekStripeConnectState(
    state: string,
  ): Promise<StripeConnectState | null> {
    if (!STRIPE_CONNECT_STATE_PATTERN.test(state)) {
      return null
    }
    return await distributedStore.get<StripeConnectState>(
      stripeConnectStateKey(state),
    )
  }

  /** The connect a callback's `state` belongs to — once; null after that. */
  async takeStripeConnectState(
    state: string,
  ): Promise<StripeConnectState | null> {
    if (!STRIPE_CONNECT_STATE_PATTERN.test(state)) {
      return null
    }
    return await distributedStore.take<StripeConnectState>(
      stripeConnectStateKey(state),
    )
  }

  /**
   * Finishes Stripe Connect: the code is exchanged exactly once (Stripe
   * revokes the connection when a code is used twice), then the account is
   * saved for the workspace. `platformCredentialId` is the app the connect
   * started with; a platform whose Stripe settings changed meanwhile refuses
   * instead of exchanging the code with another key.
   */
  async completeStripeConnect(input: {
    workspaceId: string
    ownerId: string
    platformCredentialId: string
    code: string
  }): Promise<PaymentProviderView & { chargesEnabled: boolean | null }> {
    const platform = await this.resolveStripePlatform(input.ownerId)
    if (platform.credentialId !== input.platformCredentialId) {
      throw stripePlatformNotConfiguredException()
    }
    let connection: { accountId: string; livemode: boolean }
    try {
      connection = await exchangeStripeCode({
        platformSecretKey: platform.secretKey,
        code: input.code,
      })
    } catch (error) {
      throw toPaymentProviderException("stripe", error)
    }

    const owner = await paymentProviderRepository.findByExternalAccount({
      provider: "stripe",
      platformCredentialId: platform.credentialId,
      externalAccountId: connection.accountId,
    })
    if (owner && owner.workspaceId !== input.workspaceId) {
      throw stripeAccountAlreadyConnectedException()
    }

    const account = await readStripeAccount({
      platformSecretKey: platform.secretKey,
      accountId: connection.accountId,
    }).catch((err: unknown) => {
      logger.warn(
        { err, workspaceId: input.workspaceId },
        "[payments] could not read the connected Stripe account",
      )
      return null
    })

    return await distributedLock.runExclusive({
      key: stripeConnectLockKey(input.workspaceId),
      timeoutInSeconds: STRIPE_CONNECT_LOCK_SECONDS,
      fn: async () =>
        await this.saveStripeConnect({
          workspaceId: input.workspaceId,
          platformCredentialId: platform.credentialId,
          connection,
          account,
        }),
    })
  }

  private async saveStripeConnect(input: {
    workspaceId: string
    platformCredentialId: string
    connection: { accountId: string; livemode: boolean }
    account: { label: string | null; chargesEnabled: boolean } | null
  }): Promise<PaymentProviderView & { chargesEnabled: boolean | null }> {
    const { connection, account } = input
    const previous = await paymentProviderRepository.find({
      workspaceId: input.workspaceId,
      provider: "stripe",
    })
    if (previous && changesStripeAccount(previous, connection)) {
      try {
        await this.assertNotNeededByOrders({
          workspaceId: input.workspaceId,
          provider: "stripe",
        })
      } catch (error) {
        // The new account was just connected to the platform: let it go.
        await this.deauthorizeQuietly({
          workspaceId: input.workspaceId,
          platformCredentialId: input.platformCredentialId,
          externalAccountId: connection.accountId,
        })
        throw error
      }
    }
    let row: EcommercePaymentProviderModel | undefined
    try {
      row = await paymentProviderRepository.upsert({
        workspaceId: input.workspaceId,
        provider: "stripe",
        livemode: connection.livemode,
        accountLabel: account?.label ?? null,
        externalAccountId: connection.accountId,
        platformCredentialId: input.platformCredentialId,
        secret: null,
        webhookEndpointId: null,
      })
    } catch (error) {
      if (isUniqueViolationError(error)) {
        throw stripeAccountAlreadyConnectedException()
      }
      throw error
    }
    if (!row) {
      throw new Error("Failed to save the Stripe connection")
    }
    if (previous && isStripeKeyRow(previous)) {
      // A key connection replaced: its webhook would keep calling us.
      await this.removeStripeKeyWebhookQuietly(previous)
    } else if (
      previous &&
      (previous.externalAccountId !== connection.accountId ||
        previous.platformCredentialId !== input.platformCredentialId)
    ) {
      // Another account or app replaced: it no longer belongs to this store.
      await this.deauthorizeQuietly(previous)
    }
    await this.audit("connect", "connected Stripe for the web shop")
    return { ...toView(row), chargesEnabled: account?.chargesEnabled ?? null }
  }

  /**
   * Connects the store's own Stripe account with its secret (or restricted)
   * key, without Stripe Connect: the key is checked, a webhook is created on
   * the account and both are saved encrypted. Replaces any Stripe connection
   * the workspace had; a different account is refused while orders still
   * need the old one.
   */
  async connectStripeKey(input: {
    workspaceId: string
    secretKey: string
  }): Promise<PaymentProviderView & { chargesEnabled: boolean }> {
    const secretKey = input.secretKey.trim()
    if (!isStripeSecretKey(secretKey)) {
      throw stripeSecretKeyInvalidException()
    }
    let account: Awaited<ReturnType<typeof readStripeKeyAccount>>
    try {
      account = await readStripeKeyAccount(secretKey)
    } catch (error) {
      throw toPaymentProviderException("stripe", error)
    }

    return await distributedLock.runExclusive({
      key: stripeConnectLockKey(input.workspaceId),
      timeoutInSeconds: STRIPE_CONNECT_LOCK_SECONDS,
      fn: async () =>
        await this.saveStripeKey({
          workspaceId: input.workspaceId,
          secretKey,
          account,
        }),
    })
  }

  private async saveStripeKey(input: {
    workspaceId: string
    secretKey: string
    account: Awaited<ReturnType<typeof readStripeKeyAccount>>
  }): Promise<PaymentProviderView & { chargesEnabled: boolean }> {
    const { secretKey, account } = input
    const previous = await paymentProviderRepository.find({
      workspaceId: input.workspaceId,
      provider: "stripe",
    })
    const replacesAccount = previous
      ? changesStripeAccount(previous, account)
      : false
    if (replacesAccount) {
      await this.assertNotNeededByOrders({
        workspaceId: input.workspaceId,
        provider: "stripe",
      })
    }
    const webhookUrl = await workspaceWebhookUrl(
      input.workspaceId,
      stripeAccountWebhookPath(input.workspaceId),
    )
    let webhook: Awaited<ReturnType<typeof createStripeAccountWebhook>>
    try {
      webhook = await createStripeAccountWebhook({ secretKey, url: webhookUrl })
    } catch (error) {
      throw toPaymentProviderException("stripe", error)
    }

    const connection: StripeKeySecret = {
      secretKey,
      livemode: account.livemode,
      accountId: account.accountId,
      webhookId: webhook.endpointId,
      webhookSecret: webhook.secret,
    }
    let row: EcommercePaymentProviderModel | undefined
    try {
      row = await paymentProviderRepository.upsert({
        workspaceId: input.workspaceId,
        provider: "stripe",
        livemode: account.livemode,
        accountLabel: account.label,
        externalAccountId: account.accountId,
        platformCredentialId: null,
        secret: await encryptUtils.encryptObject(
          connection,
          stripeKeySecretAad(input.workspaceId),
        ),
        webhookEndpointId: webhook.endpointId,
      })
    } catch (error) {
      await this.removeStripeKeyWebhookQuietly({
        workspaceId: input.workspaceId,
        secretKey,
        webhookId: webhook.endpointId,
      })
      throw error
    }
    if (!row) {
      throw new Error("Failed to save the Stripe connection")
    }
    if (previous) {
      if (isStripeKeyRow(previous)) {
        // The old key's webhook would keep calling us. On the same account
        // the new key removes it: a store usually reconnects because it
        // rolled the old one, which Stripe no longer accepts.
        await this.removeStripeKeyWebhookQuietly(
          previous,
          replacesAccount ? undefined : secretKey,
        )
      } else {
        // The platform no longer acts on the store's account.
        await this.deauthorizeQuietly(previous)
      }
    }
    await this.audit(
      "connect",
      "connected Stripe for the web shop with a secret key",
    )
    return { ...toView(row), chargesEnabled: account.chargesEnabled }
  }

  /**
   * Checks the store's PayPal Client ID and Secret (live first, then
   * sandbox), creates the webhook and saves the keys encrypted.
   */
  async connectPaypal(input: {
    workspaceId: string
    clientId: string
    clientSecret: string
  }): Promise<PaymentProviderView> {
    const previous = await paymentProviderRepository.find({
      workspaceId: input.workspaceId,
      provider: "paypal",
    })
    const previousSecret = previous
      ? await this.decryptPaypalSecret(previous).catch(() => null)
      : null
    if (previous && previousSecret?.clientId !== input.clientId.trim()) {
      await this.assertNotNeededByOrders({
        workspaceId: input.workspaceId,
        provider: "paypal",
      })
    }
    const webhookUrl = await workspaceWebhookUrl(
      input.workspaceId,
      paypalWebhookPath(input.workspaceId),
    )
    let connected: Awaited<ReturnType<typeof connectPaypal>>
    try {
      connected = await connectPaypal({
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        webhookUrl,
      })
    } catch (error) {
      throw toPaymentProviderException("paypal", error)
    }

    const secret = await encryptUtils.encryptObject(
      connected.secret,
      paypalSecretAad(input.workspaceId),
    )
    const row = await paymentProviderRepository.upsert({
      workspaceId: input.workspaceId,
      provider: "paypal",
      livemode: connected.livemode,
      accountLabel: maskClientId(connected.secret.clientId),
      externalAccountId: null,
      platformCredentialId: null,
      secret,
      webhookEndpointId: connected.secret.webhookId,
    })
    if (!row) {
      throw new Error("Failed to save the PayPal connection")
    }
    // Another PayPal app replaced: its webhook would keep calling us.
    if (previous && previous.webhookEndpointId !== row.webhookEndpointId) {
      await this.removePaypalWebhookQuietly(previous)
    }
    await this.audit("connect", "connected PayPal for the web shop")
    return toView(row)
  }

  /**
   * Disconnects a provider: the provider side first (best effort, so a
   * provider that does not answer never blocks it), then the connection and
   * the payment method, together. Refused while orders still need the
   * account — waiting for their money, or paid and still open (cancelling
   * one refunds through it): those are finished or cancelled first.
   */
  async disconnect(input: {
    workspaceId: string
    provider: OnlinePaymentProvider
  }): Promise<void> {
    const row = await paymentProviderRepository.find(input)
    if (!row) {
      return
    }
    await this.assertNotNeededByOrders(input)
    if (isStripeKeyRow(row)) {
      await this.removeStripeKeyWebhookQuietly(row)
    } else if (row.provider === "stripe") {
      await this.deauthorizeQuietly(row)
    } else {
      await this.removePaypalWebhookQuietly(row)
    }
    await this.removeConnection(input)
    await this.audit("disconnect", `disconnected ${input.provider}`)
  }

  /**
   * A workspace being purged: the platform lets go of the store's Stripe
   * account and its PayPal app stops calling back, best effort. No order
   * guard — the orders go with the workspace. The rows themselves are left
   * to the workspace's cascade.
   */
  async teardownForPurge(workspaceId: string): Promise<void> {
    const rows = await paymentProviderRepository.listByWorkspace(workspaceId)
    for (const row of rows) {
      if (isStripeKeyRow(row)) {
        await this.removeStripeKeyWebhookQuietly(row)
      } else if (row.provider === "stripe") {
        await this.deauthorizeQuietly(row)
      } else {
        await this.removePaypalWebhookQuietly(row)
      }
    }
  }

  /**
   * The store disconnected the platform from its Stripe dashboard. An event
   * older than the connection (the store reconnected since, or Stripe
   * delivered it late) leaves the new connection alone.
   */
  async handleStripeDeauthorized(input: {
    platformCredentialId: string
    accountId: string
    deauthorizedAt: Date
  }): Promise<void> {
    const row = await paymentProviderRepository.findByExternalAccount({
      provider: "stripe",
      platformCredentialId: input.platformCredentialId,
      externalAccountId: input.accountId,
    })
    if (!row || row.updatedAt > input.deauthorizedAt) {
      return
    }
    await this.removeConnection({
      workspaceId: row.workspaceId,
      provider: "stripe",
    })
  }

  /**
   * The gateway that takes the workspace's payments: the store's PayPal app,
   * the store's own Stripe key, or the platform key acting on the store's
   * Stripe account.
   */
  async loadGateway(
    input: { workspaceId: string; provider: OnlinePaymentProvider },
    tx: DatabaseClient = db,
  ): Promise<{ gateway: PaymentGateway; livemode: boolean }> {
    const row = await paymentProviderRepository.find(input, tx)
    if (!row) {
      throw paymentProviderNotConnectedException(input.provider)
    }
    if (isStripeKeyRow(row)) {
      const secret = await this.decryptStripeKeySecret(row)
      if (!secret) {
        throw paymentProviderNotConnectedException("stripe")
      }
      return {
        gateway: createStripeGateway({ secretKey: secret.secretKey }),
        livemode: row.livemode,
      }
    }
    if (row.provider === "stripe") {
      const platform = row.platformCredentialId
        ? await platformCredentialService.findDecryptedById({
            id: row.platformCredentialId,
            type: "stripe",
            tx,
          })
        : undefined
      if (!(platform?.config.secretKey && row.externalAccountId)) {
        throw paymentProviderNotConnectedException("stripe")
      }
      return {
        gateway: createStripeGateway({
          platformSecretKey: platform.config.secretKey,
          accountId: row.externalAccountId,
        }),
        livemode: row.livemode,
      }
    }
    const secret = await this.decryptPaypalSecret(row)
    if (!secret) {
      throw paymentProviderNotConnectedException("paypal")
    }
    return { gateway: createPaypalGateway(secret), livemode: row.livemode }
  }

  /** The workspace's PayPal keys, for checking a webhook's signature. */
  async loadPaypalSecret(workspaceId: string): Promise<PaypalSecret | null> {
    const row = await paymentProviderRepository.find({
      workspaceId,
      provider: "paypal",
    })
    return row ? await this.decryptPaypalSecret(row) : null
  }

  /**
   * The store's Stripe key and webhook secret, for checking the signature of
   * an event its own webhook received. Null when it is not connected with a
   * key (any more).
   */
  async loadStripeAccountWebhook(
    workspaceId: string,
  ): Promise<{ secretKey: string; webhookSecret: string } | null> {
    const row = await paymentProviderRepository.find({
      workspaceId,
      provider: "stripe",
    })
    if (!(row && isStripeKeyRow(row))) {
      return null
    }
    const secret = await this.decryptStripeKeySecret(row)
    return secret
      ? { secretKey: secret.secretKey, webhookSecret: secret.webhookSecret }
      : null
  }

  /**
   * The platform's Stripe key and Connect webhook secret, for checking the
   * signature of an event its Connect webhook received.
   */
  async loadStripeConnectWebhook(
    platformCredentialId: string,
  ): Promise<{ platformSecretKey: string; webhookSecret: string } | null> {
    const platform = await platformCredentialService.findDecryptedById({
      id: platformCredentialId,
      type: "stripe",
    })
    const { secretKey, connectWebhookSecret } = platform?.config ?? {}
    return secretKey && connectWebhookSecret
      ? { platformSecretKey: secretKey, webhookSecret: connectWebhookSecret }
      : null
  }

  /** The store whose Stripe account an event came from. */
  async findByStripeAccount(input: {
    platformCredentialId: string
    accountId: string
  }) {
    return await paymentProviderRepository.findByExternalAccount({
      provider: "stripe",
      platformCredentialId: input.platformCredentialId,
      externalAccountId: input.accountId,
    })
  }

  /**
   * Orders that still need the provider's account refuse a change of it: an
   * attempt made on one account cannot be read, closed or refunded through
   * another.
   */
  private async assertNotNeededByOrders(input: {
    workspaceId: string
    provider: OnlinePaymentProvider
  }) {
    const count = await orderPaymentRepository.countOrdersNeedingProvider(input)
    if (count > 0) {
      throw paymentProviderInUseException(input.provider, count)
    }
  }

  private async removeConnection(input: {
    workspaceId: string
    provider: OnlinePaymentProvider
  }) {
    await db.transaction(async (tx) => {
      await paymentProviderRepository.delete(input, tx)
      await ecommerceSettingsService.dropPaymentMethod(
        { workspaceId: input.workspaceId, method: input.provider },
        tx,
      )
    })
    await ecommerceSettingsService.invalidate(input.workspaceId)
  }

  private async decryptPaypalSecret(
    row: EcommercePaymentProviderModel,
  ): Promise<PaypalSecret | null> {
    if (!row.secret) {
      return null
    }
    return await encryptUtils.decryptObject(
      row.secret,
      paypalSecretSchema,
      paypalSecretAad(row.workspaceId),
    )
  }

  private async decryptStripeKeySecret(
    row: EcommercePaymentProviderModel,
  ): Promise<StripeKeySecret | null> {
    if (!row.secret) {
      return null
    }
    return await encryptUtils.decryptObject(
      row.secret,
      stripeKeySecretSchema,
      stripeKeySecretAad(row.workspaceId),
    )
  }

  /**
   * Removes the webhook a key connection created; best effort. With
   * `currentKey` (a newer key of the same account and mode) it is tried
   * first, then the row's own key.
   */
  private async removeStripeKeyWebhookQuietly(
    target:
      | EcommercePaymentProviderModel
      | { workspaceId: string; secretKey: string; webhookId: string },
    currentKey?: string,
  ) {
    try {
      const secret =
        "secretKey" in target
          ? target
          : await this.decryptStripeKeySecret(target).catch(() => null)
      const webhookId =
        secret?.webhookId ??
        ("webhookEndpointId" in target ? target.webhookEndpointId : null)
      if (!webhookId) {
        return
      }
      const keys = [currentKey, secret?.secretKey].filter(
        (key, index, all): key is string =>
          Boolean(key) && all.indexOf(key) === index,
      )
      let lastError: unknown
      for (const key of keys) {
        try {
          await deleteStripeAccountWebhook({
            secretKey: key,
            endpointId: webhookId,
          })
          return
        } catch (error) {
          lastError = error
        }
      }
      if (lastError) {
        throw lastError
      }
    } catch (err) {
      logger.warn(
        { err, workspaceId: target.workspaceId },
        "[payments] could not remove the Stripe webhook",
      )
    }
  }

  private async deauthorizeQuietly(
    row: Pick<
      EcommercePaymentProviderModel,
      "workspaceId" | "platformCredentialId" | "externalAccountId"
    >,
  ) {
    try {
      const platform = row.platformCredentialId
        ? await platformCredentialService.findDecryptedById({
            id: row.platformCredentialId,
            type: "stripe",
          })
        : undefined
      const { secretKey, connectClientId } = platform?.config ?? {}
      if (!(secretKey && connectClientId && row.externalAccountId)) {
        return
      }
      await deauthorizeStripe({
        platformSecretKey: secretKey,
        clientId: connectClientId,
        accountId: row.externalAccountId,
      })
    } catch (err) {
      logger.warn(
        { err, workspaceId: row.workspaceId },
        "[payments] could not deauthorize the Stripe account",
      )
    }
  }

  private async removePaypalWebhookQuietly(row: EcommercePaymentProviderModel) {
    try {
      const secret = await this.decryptPaypalSecret(row)
      if (secret) {
        await disconnectPaypal(secret)
      }
    } catch (err) {
      logger.warn(
        { err, workspaceId: row.workspaceId },
        "[payments] could not remove the PayPal webhook",
      )
    }
  }
}

export const paymentProviderService = new PaymentProviderService()
