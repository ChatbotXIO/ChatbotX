import type { StripeCredential } from "@chatbotx.io/database/partials"
import { paymentProviderRepository } from "@chatbotx.io/database/repositories"
import {
  deleteStripeConnectWebhook,
  ensureStripeConnectWebhook,
  readPlatformStripeAccountId,
} from "@chatbotx.io/payments"
import { joinAppUrl } from "@chatbotx.io/utils/web-url"
import { logger } from "../logger"
import { platformCredentialService } from "../platform-credential/service"
import {
  stripePlatformAccountInUseException,
  toPaymentProviderException,
} from "./errors"
import { stripeConnectWebhookPath } from "./service"

/**
 * Saves the platform's (or a reseller's) Stripe settings. The Connect
 * webhook that receives every connected store's events is created on the
 * account (or kept when it already exists), and its
 * signing secret is stored with the encrypted settings.
 */
export const savePlatformStripe = async (input: {
  /** A reseller's own settings; undefined for the platform's. */
  userId: string | undefined
  publishableKey: string
  verifyToken: string
  secretKey: string
  connectClientId: string
  /**
   * Where Stripe reaches this platform: the reseller's own domain for their
   * own app, the broker otherwise — the same origin as the Connect redirect
   * URI, so a reseller's Stripe dashboard never shows the platform's.
   */
  webhookOrigin: string
}): Promise<void> => {
  const existing = await platformCredentialService.findDecrypted({
    userId: input.userId,
    type: "stripe",
  })
  // Which Stripe account the key belongs to — also checks the key works.
  let accountId: string
  try {
    accountId = await readPlatformStripeAccountId(input.secretKey)
  } catch (error) {
    throw toPaymentProviderException("stripe", error)
  }
  const previousAccountId = existing
    ? (existing.config.platformAccountId ??
      (await readPlatformStripeAccountId(existing.config.secretKey).catch(
        () => null,
      )))
    : null
  const sameAccount = Boolean(existing) && previousAccountId === accountId
  // Stores connected through the current account would be cut off by a key
  // of another one: every call on their behalf is made with this key.
  if (existing && !sameAccount) {
    const connected = await paymentProviderRepository.countByPlatformCredential(
      existing.id,
    )
    if (connected > 0) {
      throw stripePlatformAccountInUseException(connected)
    }
  }
  // A webhook belongs to the Stripe account it was created on.
  const keptWebhook =
    sameAccount &&
    existing?.config.connectWebhookEndpointId &&
    existing.config.connectWebhookSecret
      ? {
          endpointId: existing.config.connectWebhookEndpointId,
          secret: existing.config.connectWebhookSecret,
        }
      : null

  const config: StripeCredential = {
    publishableKey: input.publishableKey,
    verifyToken: input.verifyToken,
    secretKey: input.secretKey,
    platformAccountId: accountId,
    connectClientId: input.connectClientId,
    ...(keptWebhook
      ? {
          connectWebhookEndpointId: keptWebhook.endpointId,
          connectWebhookSecret: keptWebhook.secret,
        }
      : {}),
  }
  await platformCredentialService.upsert({
    userId: input.userId,
    type: "stripe",
    config,
  })

  if (!sameAccount && existing?.config.connectWebhookEndpointId) {
    await removeWebhookQuietly(
      existing.config.secretKey,
      existing.config.connectWebhookEndpointId,
    )
  }
  const saved = await platformCredentialService.find({
    userId: input.userId,
    type: "stripe",
  })
  if (!saved) {
    throw new Error("Failed to save the Stripe settings")
  }
  let webhook: { endpointId: string; secret: string }
  try {
    webhook = await ensureStripeConnectWebhook({
      platformSecretKey: input.secretKey,
      url: joinAppUrl(input.webhookOrigin, stripeConnectWebhookPath(saved.id)),
      existing: keptWebhook,
    })
  } catch (error) {
    throw toPaymentProviderException("stripe", error)
  }
  if (
    webhook.endpointId === keptWebhook?.endpointId &&
    webhook.secret === keptWebhook.secret
  ) {
    return
  }
  await platformCredentialService.upsert({
    userId: input.userId,
    type: "stripe",
    config: {
      ...config,
      connectWebhookEndpointId: webhook.endpointId,
      connectWebhookSecret: webhook.secret,
    },
  })
}

/**
 * Removes the Stripe settings and, best effort, their Connect webhook.
 * Refused while stores are connected through them.
 */
export const removePlatformStripe = async (input: {
  userId: string | undefined
}): Promise<void> => {
  const existing = await platformCredentialService.findDecrypted({
    userId: input.userId,
    type: "stripe",
  })
  if (existing) {
    const connected = await paymentProviderRepository.countByPlatformCredential(
      existing.id,
    )
    if (connected > 0) {
      throw stripePlatformAccountInUseException(connected)
    }
  }
  await platformCredentialService.remove({
    userId: input.userId,
    type: "stripe",
  })
  if (existing?.config.connectWebhookEndpointId) {
    await removeWebhookQuietly(
      existing.config.secretKey,
      existing.config.connectWebhookEndpointId,
    )
  }
}

const removeWebhookQuietly = async (secretKey: string, endpointId: string) => {
  try {
    await deleteStripeConnectWebhook({
      platformSecretKey: secretKey,
      endpointId,
    })
  } catch (err) {
    logger.warn(
      { err, endpointId },
      "[payments] could not remove the Stripe Connect webhook",
    )
  }
}

/** Whether the saved Stripe settings have their Connect webhook. */
export const hasPlatformStripeWebhook = async (input: {
  userId: string | undefined
}): Promise<boolean> => {
  const existing = await platformCredentialService.findDecrypted({
    userId: input.userId,
    type: "stripe",
  })
  return Boolean(existing?.config.connectWebhookSecret)
}
