import {
  orderPaymentService,
  withBlockedOwnerGuard,
} from "@chatbotx.io/business"
import type { IntegrationJobConfirmOrderPayment } from "@chatbotx.io/worker-config"

/**
 * A signed Stripe or PayPal webhook about a web shop payment: the provider is
 * asked again and the order settled — paid and announced, or the money
 * refunded when it has no order to pay. A refund that fails throws, so the job
 * is retried; the refund key never refunds twice.
 */
export async function confirmOrderPayment(
  data: IntegrationJobConfirmOrderPayment["data"],
): Promise<void> {
  await withBlockedOwnerGuard(data.workspaceId, () =>
    orderPaymentService.handleWebhookEvent(data),
  )
}
