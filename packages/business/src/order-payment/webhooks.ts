import type { OnlinePaymentProvider } from "@chatbotx.io/database/partials"
import {
  isPaymentProviderError,
  type PaymentWebhookEvent,
  parsePaypalWebhook,
  parseStripeConnectWebhook,
} from "@chatbotx.io/payments"
import {
  getOrderPaymentEventJobId,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../logger"
import { paymentProviderService } from "../payment-provider/service"

/** What a webhook route answers: 400 for a bad signature, 404 for nothing to verify against. */
export type WebhookReceipt = { status: 200 | 400 | 404 }

const OK: WebhookReceipt = { status: 200 }

/** A bad signature is the sender's problem (400); anything else is retried. */
const toReceiptOrThrow = (error: unknown): WebhookReceipt => {
  if (isPaymentProviderError(error) && error.kind === "signatureInvalid") {
    return { status: 400 }
  }
  throw error
}

const enqueue = async (input: {
  provider: OnlinePaymentProvider
  workspaceId: string
  event: Extract<PaymentWebhookEvent, { kind: "checkout" }>
}) => {
  await integrationQueue.add(
    IntegrationJobAction.confirmOrderPayment,
    {
      type: IntegrationJobAction.confirmOrderPayment,
      data: {
        provider: input.provider,
        workspaceId: input.workspaceId,
        reference: input.event.reference,
        metadata: input.event.metadata,
      },
    },
    { jobId: getOrderPaymentEventJobId(input.provider, input.event.eventId) },
  )
}

/**
 * An event the platform's Stripe Connect webhook received. Signed with that
 * platform app's webhook secret; the store is found by the connected account
 * the event came from, and an attempt whose metadata names another workspace
 * is ignored. Payment events are settled by a job; a store disconnecting the
 * platform from its own Stripe dashboard is applied here.
 */
export const receiveStripeWebhook = async (input: {
  platformCredentialId: string
  rawBody: string
  headers: Headers
}): Promise<WebhookReceipt> => {
  const secrets = await paymentProviderService.loadStripeConnectWebhook(
    input.platformCredentialId,
  )
  if (!secrets) {
    return { status: 404 }
  }
  let event: PaymentWebhookEvent
  try {
    event = await parseStripeConnectWebhook({
      rawBody: input.rawBody,
      headers: input.headers,
      ...secrets,
    })
  } catch (error) {
    return toReceiptOrThrow(error)
  }
  if (event.kind === "deauthorized") {
    await paymentProviderService.handleStripeDeauthorized({
      platformCredentialId: input.platformCredentialId,
      accountId: event.account,
      deauthorizedAt: event.createdAt,
    })
    return OK
  }
  // Events of the platform's own account carry no `account`: not a store's.
  if (event.kind === "ignored" || !event.account) {
    return OK
  }
  const store = await paymentProviderService.findByStripeAccount({
    platformCredentialId: input.platformCredentialId,
    accountId: event.account,
  })
  if (!store) {
    return OK
  }
  if (event.metadata && event.metadata.workspaceId !== store.workspaceId) {
    logger.warn(
      { workspaceId: store.workspaceId, eventId: event.eventId },
      "[payments] a Stripe event named another workspace",
    )
    return OK
  }
  await enqueue({ provider: "stripe", workspaceId: store.workspaceId, event })
  return OK
}

/**
 * An event the workspace's PayPal webhook received, verified by PayPal
 * against the webhook created on connect.
 */
export const receivePaypalWebhook = async (input: {
  workspaceId: string
  rawBody: string
  headers: Headers
}): Promise<WebhookReceipt> => {
  const secret = await paymentProviderService.loadPaypalSecret(
    input.workspaceId,
  )
  if (!secret) {
    return { status: 404 }
  }
  let event: PaymentWebhookEvent
  try {
    event = await parsePaypalWebhook({
      rawBody: input.rawBody,
      headers: input.headers,
      secret,
    })
  } catch (error) {
    return toReceiptOrThrow(error)
  }
  if (event.kind !== "checkout") {
    return OK
  }
  if (event.metadata && event.metadata.workspaceId !== input.workspaceId) {
    logger.warn(
      { workspaceId: input.workspaceId, eventId: event.eventId },
      "[payments] a PayPal event named another workspace",
    )
    return OK
  }
  await enqueue({ provider: "paypal", workspaceId: input.workspaceId, event })
  return OK
}
