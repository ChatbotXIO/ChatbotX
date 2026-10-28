import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import {
  isOnlinePaymentMethod,
  type OrderStatus,
} from "@chatbotx.io/database/partials"
import { orderPaymentRepository } from "@chatbotx.io/database/repositories"
import type { OrderModel, OrderPaymentModel } from "@chatbotx.io/database/types"
import type { PaymentGateway } from "@chatbotx.io/payments"
import { logger } from "../logger"
import {
  orderPaidOnlineException,
  orderPaymentProcessingException,
  orderRefundFailedException,
} from "../order/errors"
import {
  callPaymentProvider,
  isPaymentProviderNotConnected,
  paymentProviderNotConnectedException,
} from "../payment-provider/errors"
import { paymentProviderService } from "../payment-provider/service"

/** An attempt's refund key: the same attempt is never refunded twice. */
export const refundIdempotencyKey = (orderPaymentId: string) =>
  `refund-${orderPaymentId}`

/** The statuses in which an order still holds the money and the stock. */
const OPEN_ORDER_STATUSES: readonly OrderStatus[] = [
  "pending",
  "accepted",
  "shipped",
]

/**
 * Refunds one attempt in full and records it. A refund the provider says
 * was already made counts as done; any other failure refuses the change the
 * caller is making, so nothing moves while the money is still out.
 */
export const refundAttempt = async (input: {
  gateway: PaymentGateway
  payment: OrderPaymentModel
  transactionId: string
  tx: DatabaseClient
}): Promise<void> => {
  const { gateway, payment, transactionId, tx } = input
  let refundId: string | null
  try {
    ;({ refundId } = await gateway.refund({
      transactionId,
      idempotencyKey: refundIdempotencyKey(payment.id),
    }))
  } catch (error) {
    logger.error(
      {
        err: error,
        orderId: payment.orderId,
        orderPaymentId: payment.id,
        provider: payment.provider,
      },
      "[payments] refund failed",
    )
    throw orderRefundFailedException(payment.provider)
  }
  await orderPaymentRepository.updateStatus(
    {
      workspaceId: payment.workspaceId,
      id: payment.id,
      from: ["open", "paid", "expired"],
      values: {
        status: "refunded",
        transactionId,
        refundId,
        refundedAt: new Date(),
      },
    },
    tx,
  )
}

/** The order's provider, or null when the store disconnected it since. */
const loadGatewayUnlessDisconnected = async (
  order: OrderModel,
  tx: DatabaseClient,
): Promise<PaymentGateway | null> => {
  if (!isOnlinePaymentMethod(order.paymentMethod)) {
    return null
  }
  try {
    return (
      await paymentProviderService.loadGateway(
        { workspaceId: order.workspaceId, provider: order.paymentMethod },
        tx,
      )
    ).gateway
  } catch (error) {
    if (isPaymentProviderNotConnected(error)) {
      logger.warn(
        { orderId: order.id, provider: order.paymentMethod },
        "[payments] the order's provider is no longer connected",
      )
      return null
    }
    throw error
  }
}

/**
 * Thrown by an expiry cancel when a page turns out paid as it is closed: the
 * customer paid in time, so the order is kept (and marked paid) instead of
 * being cancelled and refunded.
 */
export class LatePaymentArrivedError extends Error {
  constructor() {
    super("A payment arrived as the order expired.")
    this.name = "LatePaymentArrivedError"
  }
}

/**
 * Inside the transaction that cancels `order` (its row locked): no money may
 * stay with the store. In two passes, so a provider that fails cannot leave
 * money refunded but unrecorded:
 * 1. every open page is closed at the provider — one the customer paid
 *    meanwhile joins the refunds (or, for the expiry scan's cancel, stops it
 *    with `LatePaymentArrivedError`: that customer paid in time); one still
 *    settling refuses the cancel;
 * 2. the refunds, each recorded at once outside the transaction (`db`), so
 *    a refund made before a later failure rolls the cancel back stays known
 *    and is not made again.
 * Returns whether the order's money went back (now or by an earlier try).
 */
export const settlePaymentsForCancel = async (
  order: OrderModel,
  tx: DatabaseClient,
  options: { keepLatePayment?: boolean } = {},
): Promise<{ refunded: boolean }> => {
  if (!isOnlinePaymentMethod(order.paymentMethod)) {
    return { refunded: false }
  }
  const attempts = await orderPaymentRepository.listByOrder(
    { workspaceId: order.workspaceId, orderId: order.id },
    tx,
  )
  const refundedBefore = attempts.some(
    (attempt) => attempt.status === "refunded",
  )
  const unsettled = attempts.filter(
    (attempt) => attempt.status === "open" || attempt.status === "paid",
  )
  if (unsettled.length === 0) {
    return { refunded: refundedBefore }
  }
  const gateway = await loadGatewayUnlessDisconnected(order, tx)
  if (!gateway) {
    // The store disconnected the provider: nothing can be refunded from
    // here, so a paid attempt keeps the order; open ones are let go.
    if (unsettled.some((attempt) => attempt.status === "paid")) {
      throw paymentProviderNotConnectedException(order.paymentMethod)
    }
    for (const attempt of unsettled) {
      await markExpired(attempt, tx)
    }
    return { refunded: refundedBefore }
  }

  const refunds: Array<{ payment: OrderPaymentModel; transactionId: string }> =
    []
  for (const attempt of unsettled) {
    if (attempt.status === "paid") {
      if (attempt.transactionId) {
        refunds.push({ payment: attempt, transactionId: attempt.transactionId })
      }
      continue
    }
    const status = await callPaymentProvider(attempt.provider, () =>
      gateway.expireCheckout(attempt.providerReference),
    )
    if (status.state === "paid") {
      if (options.keepLatePayment && order.paymentStatus !== "paid") {
        throw new LatePaymentArrivedError()
      }
      refunds.push({ payment: attempt, transactionId: status.transactionId })
    } else if (status.state === "processing") {
      throw orderPaymentProcessingException()
    } else {
      await markExpired(attempt, tx)
    }
  }
  for (const refund of refunds) {
    await refundAttempt({ gateway, ...refund, tx: db })
  }
  return { refunded: refundedBefore || refunds.length > 0 }
}

const markExpired = async (attempt: OrderPaymentModel, tx: DatabaseClient) => {
  await orderPaymentRepository.updateStatus(
    {
      workspaceId: attempt.workspaceId,
      id: attempt.id,
      from: ["open"],
      values: { status: "expired" },
    },
    tx,
  )
}

/**
 * Inside the transaction that deletes `order` (its row locked): an order
 * still open that was paid online is refused — cancelling it refunds the
 * payment, deleting would keep the money without an order. Its open
 * attempts are closed so nobody pays for an order that is gone.
 */
export const assertDeletableWithPayments = async (
  order: OrderModel,
  tx: DatabaseClient,
): Promise<void> => {
  if (
    !(
      isOnlinePaymentMethod(order.paymentMethod) &&
      OPEN_ORDER_STATUSES.includes(order.status)
    )
  ) {
    return
  }
  if (order.paymentStatus === "paid") {
    throw orderPaidOnlineException()
  }
  const open = (
    await orderPaymentRepository.listByOrder(
      { workspaceId: order.workspaceId, orderId: order.id },
      tx,
    )
  ).filter((attempt) => attempt.status === "open")
  if (open.length === 0) {
    return
  }
  const gateway = await loadGatewayUnlessDisconnected(order, tx)
  if (!gateway) {
    return
  }
  for (const attempt of open) {
    const status = await callPaymentProvider(attempt.provider, () =>
      gateway.expireCheckout(attempt.providerReference),
    )
    if (status.state === "paid" || status.state === "processing") {
      // The webhook records the payment; the order must be cancelled instead.
      throw orderPaidOnlineException()
    }
  }
}
