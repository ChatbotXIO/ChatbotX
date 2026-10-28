import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import {
  isAwaitingOnlinePayment,
  isOnlinePaymentMethod,
  type OnlinePaymentProvider,
} from "@chatbotx.io/database/partials"
import {
  orderPaymentDueRepository,
  orderPaymentRepository,
  orderRepository,
} from "@chatbotx.io/database/repositories"
import type { OrderModel, OrderPaymentModel } from "@chatbotx.io/database/types"
import { signShopToken } from "@chatbotx.io/encryption/shop-token"
import type {
  CheckoutStatus,
  PaymentGateway,
  PaymentMetadata,
} from "@chatbotx.io/payments"
import { createId } from "@chatbotx.io/utils"
import { joinAppUrl } from "@chatbotx.io/utils/web-url"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"
import { logger } from "../logger"
import {
  orderPaymentContactRequiredException,
  orderPaymentNotOpenException,
} from "../order/errors"
import { orderService } from "../order/service"
import {
  callPaymentProvider,
  isPaymentProviderNotConnected,
} from "../payment-provider/errors"
import { paymentProviderService } from "../payment-provider/service"
import { resolveWorkspaceAppUrl } from "../platform/settings"
import { workspaceService } from "../workspace/service"
import { LatePaymentArrivedError, refundAttempt } from "./settle"

/** Stripe closes a Checkout Session no sooner than 30 minutes after it opens. */
const MIN_PROVIDER_PAGE_MS = 31 * 60_000
/** An open page is offered again only with this long left on it. */
const REUSE_MARGIN_MS = 2 * 60_000
/** A payment still settling at the deadline is looked at again this much later. */
const PROCESSING_RECHECK_MS = 60 * 60_000
/** A provider that did not answer at the deadline is asked again this much later. */
const RETRY_LATER_MS = 5 * 60_000
/** An open attempt is swept this long after its page's end. */
const STALE_ATTEMPT_GRACE_MS = 15 * 60_000

/** What reading one attempt from its provider came to. */
type SyncOutcome =
  | { kind: "none"; state: CheckoutStatus["state"] | "settled" }
  | { kind: "paid"; order: OrderModel }
  | {
      /** Money that must go back: its order is gone, cancelled, paid already, or the amount is wrong. */
      kind: "refund"
      payment: OrderPaymentModel
      transactionId: string
      gateway: PaymentGateway
    }

export type ExpireOutcome =
  | "skipped"
  | "paid"
  | "processing"
  | "cancelled"
  | "retryLater"

/** The attempt's amount in the provider's minor units, or null if it has none. */
const expectedMinorUnits = (
  gateway: PaymentGateway,
  payment: OrderPaymentModel,
): number | null => {
  try {
    return gateway.toMinorUnits(payment.amount, payment.currency)
  } catch {
    return null
  }
}

/** An order a payment may still settle: pending and waiting for its money. */
const isWaitingForPayment = (order: OrderModel | undefined) =>
  order?.status === "pending" && isAwaitingOnlinePayment(order)

class OrderPaymentService extends BaseService {
  /**
   * The provider page the customer pays the order on. An open page with time
   * left is offered again; otherwise a new one is opened. Runs under the
   * order's lock, so a double tap opens one page and an order being cancelled
   * gets none.
   */
  async startCheckout(input: {
    workspaceId: string
    orderId: string
  }): Promise<{ url: string; expiresAt: Date }> {
    return await db.transaction(async (tx) => {
      const order = await orderRepository.findForUpdate(input, tx)
      if (!order) {
        throw notFoundException("Order does not exist.")
      }
      const provider = order.paymentMethod
      if (!isOnlinePaymentMethod(provider)) {
        throw orderPaymentNotOpenException("notPaidOnline")
      }
      if (order.paymentStatus !== "unpaid") {
        throw orderPaymentNotOpenException(order.paymentStatus)
      }
      const now = Date.now()
      if (
        order.status !== "pending" ||
        !order.paymentExpiresAt ||
        order.paymentExpiresAt.getTime() <= now
      ) {
        throw orderPaymentNotOpenException("expired")
      }
      if (!order.contactId) {
        throw orderPaymentContactRequiredException()
      }
      const paymentExpiresAt = order.paymentExpiresAt

      const attempts = await orderPaymentRepository.listByOrder(input, tx)
      const reusable = attempts.find(
        (attempt) =>
          attempt.status === "open" &&
          attempt.provider === provider &&
          attempt.amount === order.total &&
          attempt.currency === order.currency &&
          attempt.expiresAt.getTime() > now + REUSE_MARGIN_MS,
      )
      if (reusable) {
        return { url: reusable.checkoutUrl, expiresAt: paymentExpiresAt }
      }

      const { gateway, livemode } = await paymentProviderService.loadGateway(
        { workspaceId: order.workspaceId, provider },
        tx,
      )
      const orderPaymentId = createId()
      const [urls, workspace] = await Promise.all([
        this.buildReturnUrls(order, order.contactId),
        workspaceService.findById({ id: order.workspaceId }),
      ])
      // The page outlives the order's deadline when the provider insists on
      // a longer one; the expiry scan closes it at the deadline anyway.
      const pageExpiresAt = new Date(
        Math.max(paymentExpiresAt.getTime(), now + MIN_PROVIDER_PAGE_MS),
      )
      const metadata: PaymentMetadata = {
        workspaceId: order.workspaceId,
        orderId: order.id,
        orderPaymentId,
      }
      const created = await callPaymentProvider(provider, () =>
        gateway.createCheckout({
          amount: order.total,
          currency: order.currency,
          description: `${workspace.name} #${order.number}`,
          returnUrl: urls.returnUrl,
          cancelUrl: urls.cancelUrl,
          expiresAt: pageExpiresAt,
          customerEmail: order.customerEmail,
          metadata,
          idempotencyKey: `order-payment-${orderPaymentId}`,
        }),
      )
      await orderPaymentRepository.insert(
        {
          id: orderPaymentId,
          orderId: order.id,
          workspaceId: order.workspaceId,
          provider,
          providerReference: created.reference,
          amount: order.total,
          currency: order.currency,
          status: "open",
          livemode,
          checkoutUrl: created.url,
          expiresAt: pageExpiresAt,
        },
        tx,
      )
      return { url: created.url, expiresAt: paymentExpiresAt }
    })
  }

  /**
   * The customer came back from the provider's page: every open attempt is
   * read again (an approved PayPal order is captured), so the order shows
   * paid without waiting for the webhook. Best effort — the webhook settles
   * whatever this could not.
   */
  async syncOrder(input: { workspaceId: string; orderId: string }) {
    const attempts = await orderPaymentRepository.listByOrder(input)
    for (const attempt of attempts.filter(
      (candidate) => candidate.status === "open",
    )) {
      try {
        await this.syncAttempt(attempt)
      } catch (err) {
        logger.warn(
          { err, orderId: input.orderId, orderPaymentId: attempt.id },
          "[payments] could not read the payment back from the provider",
        )
      }
    }
  }

  /**
   * A webhook the provider signed, about one attempt. The provider is asked
   * again rather than trusting the event's own fields. An attempt whose order
   * was deleted is only reported (the order may have been delivered and
   * deleted afterwards, so its money is never taken back blindly); anything
   * that is not this workspace's is ignored.
   */
  async handleWebhookEvent(input: {
    provider: OnlinePaymentProvider
    workspaceId: string
    reference: string
    metadata: PaymentMetadata | null
  }): Promise<void> {
    const attempt = await orderPaymentRepository.findByReference({
      provider: input.provider,
      providerReference: input.reference,
    })
    if (!attempt) {
      if (input.metadata?.workspaceId === input.workspaceId) {
        logger.warn(
          {
            orderId: input.metadata.orderId,
            orderPaymentId: input.metadata.orderPaymentId,
            provider: input.provider,
          },
          "[payments] a payment event for a deleted order; nothing changed",
        )
      }
      return
    }
    if (attempt.workspaceId !== input.workspaceId) {
      logger.warn(
        { orderPaymentId: attempt.id, workspaceId: input.workspaceId },
        "[payments] a webhook named another workspace's payment",
      )
      return
    }
    await this.syncAttempt(attempt)
  }

  /** Moves an unpaid order's deadline on (a blocked owner, a busy provider). */
  async postponeExpiry(input: {
    workspaceId: string
    orderId: string
    minutes: number
  }): Promise<void> {
    await orderPaymentDueRepository.postponeExpiry({
      workspaceId: input.workspaceId,
      orderId: input.orderId,
      until: new Date(Date.now() + input.minutes * 60_000),
    })
  }

  /** Open attempts well past their page's end, for the sweep. */
  async listStaleAttempts(input: { limit: number }) {
    return await orderPaymentRepository.listStale({
      before: new Date(Date.now() - STALE_ATTEMPT_GRACE_MS),
      limit: input.limit,
    })
  }

  /**
   * An open attempt well past its page's end, read once more: a page that
   * closed is marked expired, and money that came in for an order no longer
   * waiting for it (paid by another page, cancelled) is refunded — what a
   * webhook job that ran out of retries left behind. One still settling is
   * moved out of the way. One still open (a PayPal order nobody captured,
   * since its order was paid by another page) or whose provider is gone is
   * marked expired: a PayPal order is only charged when captured, and a
   * capture is only made for an order waiting for its money.
   */
  async settleStaleAttempt(attempt: OrderPaymentModel): Promise<void> {
    const outcome = await this.syncAttemptUnlessDisconnected(attempt)
    if (outcome?.kind === "none" && outcome.state === "processing") {
      await this.postponeStaleAttempt(attempt)
    } else if (
      !outcome ||
      (outcome.kind === "none" && outcome.state === "open")
    ) {
      await orderPaymentRepository.updateStatus({
        workspaceId: attempt.workspaceId,
        id: attempt.id,
        from: ["open"],
        values: { status: "expired" },
      })
    }
  }

  /**
   * Moves an attempt behind the others in the sweep (a blocked owner, still
   * settling, a provider that failed): only touched, so the sweep looks at it
   * again `STALE_ATTEMPT_GRACE_MS` later. Its `expiresAt` stays the page's
   * real end, which `startCheckout` relies on to never offer a dead page.
   */
  async postponeStaleAttempt(attempt: OrderPaymentModel): Promise<void> {
    await orderPaymentRepository.updateStatus({
      workspaceId: attempt.workspaceId,
      id: attempt.id,
      from: ["open"],
      values: {},
    })
  }

  /** Online orders past their payment deadline, for the expiry scan. */
  async listOverdue(input: { limit: number }) {
    return await orderPaymentDueRepository.listOverdue({
      now: new Date(),
      limit: input.limit,
    })
  }

  /**
   * An online order past its deadline: a payment that did come in (an
   * approved PayPal order is captured) keeps it; one still settling is looked
   * at again later; otherwise it is cancelled — stock and code given back,
   * the provider's page closed. A provider that does not answer moves the
   * deadline a few minutes on, so one store never holds up the others.
   */
  async expireOrder(input: {
    workspaceId: string
    orderId: string
  }): Promise<ExpireOutcome> {
    const order = await orderRepository.find(input)
    const now = new Date()
    if (
      !(
        isWaitingForPayment(order) &&
        order?.paymentExpiresAt &&
        order.paymentExpiresAt <= now
      )
    ) {
      return "skipped"
    }
    try {
      const open = (await orderPaymentRepository.listByOrder(input)).filter(
        (attempt) => attempt.status === "open",
      )
      for (const attempt of open) {
        const outcome = await this.syncAttemptUnlessDisconnected(attempt)
        if (outcome?.kind === "paid") {
          return "paid"
        }
        if (outcome?.kind === "none" && outcome.state === "processing") {
          await orderPaymentDueRepository.postponeExpiry({
            ...input,
            until: new Date(now.getTime() + PROCESSING_RECHECK_MS),
          })
          return "processing"
        }
      }
      await orderService.transition({
        ...input,
        to: "cancelled",
        actor: { type: "system" },
        reason: "paymentExpired",
      })
      return "cancelled"
    } catch (error) {
      if (error instanceof LatePaymentArrivedError) {
        // Paid as its page was being closed: read again, so the order is
        // marked paid now (or, if the amount is wrong, refunded and the
        // next scan cancels it).
        return await this.settleLatePayment(input, now)
      }
      if (
        error instanceof ChatbotXException &&
        error.code === "orderInvalidStatusTransition"
      ) {
        return "skipped"
      }
      logger.warn(
        { err: error, orderId: input.orderId },
        "[payments] could not expire the order; trying again later",
      )
      await orderPaymentDueRepository.postponeExpiry({
        ...input,
        until: new Date(now.getTime() + RETRY_LATER_MS),
      })
      return "retryLater"
    }
  }

  /** An expiry cancel found a page paid as it closed: that payment keeps the order. */
  private async settleLatePayment(
    input: { workspaceId: string; orderId: string },
    now: Date,
  ): Promise<ExpireOutcome> {
    try {
      const open = (await orderPaymentRepository.listByOrder(input)).filter(
        (attempt) => attempt.status === "open",
      )
      for (const attempt of open) {
        const outcome = await this.syncAttemptUnlessDisconnected(attempt)
        if (outcome?.kind === "paid") {
          return "paid"
        }
      }
    } catch (error) {
      logger.warn(
        { err: error, orderId: input.orderId },
        "[payments] could not record a payment that arrived at the deadline; trying again later",
      )
    }
    await orderPaymentDueRepository.postponeExpiry({
      ...input,
      until: new Date(now.getTime() + RETRY_LATER_MS),
    })
    return "retryLater"
  }

  /**
   * Reads one attempt from its provider and applies it, under the order's
   * lock then the attempt's (the order every payment path takes). An
   * approved PayPal order is captured only while its order still waits for
   * the money, so a cancelled order is never charged.
   */
  private async syncAttempt(attempt: OrderPaymentModel): Promise<SyncOutcome> {
    const { gateway } = await paymentProviderService.loadGateway({
      workspaceId: attempt.workspaceId,
      provider: attempt.provider,
    })
    const outcome = await db.transaction(async (tx) => {
      const order = await orderRepository.findForUpdate(
        { workspaceId: attempt.workspaceId, orderId: attempt.orderId },
        tx,
      )
      const payment = await orderPaymentRepository.findForUpdate(
        { workspaceId: attempt.workspaceId, id: attempt.id },
        tx,
      )
      if (
        !payment ||
        payment.status === "paid" ||
        payment.status === "refunded"
      ) {
        return { kind: "none", state: "settled" } as const
      }
      const status = await callPaymentProvider(payment.provider, () =>
        gateway.getCheckoutStatus(
          payment.providerReference,
          isWaitingForPayment(order)
            ? // An order is captured once at most (PayPal refuses a second
              // capture), so each try gets its own key: one declined capture
              // never replays its failure for the next funding source.
              {
                capture: {
                  idempotencyKey: `capture-${payment.id}-${crypto.randomUUID()}`,
                },
              }
            : undefined,
        ),
      )
      return await this.applyStatus({ order, payment, status, gateway, tx })
    })
    await this.afterSync(outcome)
    return outcome
  }

  /** As `syncAttempt`; null when the store disconnected the provider since. */
  private async syncAttemptUnlessDisconnected(
    attempt: OrderPaymentModel,
  ): Promise<SyncOutcome | null> {
    try {
      return await this.syncAttempt(attempt)
    } catch (error) {
      if (isPaymentProviderNotConnected(error)) {
        return null
      }
      throw error
    }
  }

  /**
   * What the provider said, applied inside the locks. Paid is checked to
   * the provider's smallest unit and currency: money that does not match the
   * order, or that arrives for an order gone, cancelled or already paid, is
   * refunded (after the commit) rather than kept.
   */
  private async applyStatus(input: {
    order: OrderModel | undefined
    payment: OrderPaymentModel
    status: CheckoutStatus
    gateway: PaymentGateway
    tx: DatabaseClient
  }): Promise<SyncOutcome> {
    const { order, payment, status, gateway, tx } = input
    if (status.state !== "paid") {
      if (status.state === "closed") {
        await orderPaymentRepository.updateStatus(
          {
            workspaceId: payment.workspaceId,
            id: payment.id,
            from: ["open"],
            values: { status: "expired" },
          },
          tx,
        )
      }
      return { kind: "none", state: status.state }
    }

    const refund = {
      kind: "refund",
      payment,
      transactionId: status.transactionId,
      gateway,
    } as const
    const expected = expectedMinorUnits(gateway, payment)
    if (
      expected === null ||
      status.amountMinor !== expected ||
      status.currency !== payment.currency.toUpperCase()
    ) {
      logger.error(
        {
          orderPaymentId: payment.id,
          orderId: payment.orderId,
          expectedMinor: expected,
          paidMinor: status.amountMinor,
          expectedCurrency: payment.currency,
          paidCurrency: status.currency,
        },
        "[payments] the amount paid does not match the order; refunding it",
      )
      return refund
    }
    if (!isWaitingForPayment(order)) {
      logger.warn(
        {
          orderPaymentId: payment.id,
          orderId: payment.orderId,
          orderStatus: order?.status ?? null,
          paymentStatus: order?.paymentStatus ?? null,
        },
        "[payments] money came in for an order no longer waiting for it; refunding it",
      )
      return refund
    }

    const paidAt = new Date()
    const paidOrder = await orderRepository.markPaid(
      {
        workspaceId: payment.workspaceId,
        orderId: payment.orderId,
        paidAt,
      },
      tx,
    )
    if (!paidOrder) {
      return refund
    }
    await orderPaymentRepository.updateStatus(
      {
        workspaceId: payment.workspaceId,
        id: payment.id,
        from: ["open", "expired"],
        values: {
          status: "paid",
          transactionId: status.transactionId,
          paidAt,
        },
      },
      tx,
    )
    return { kind: "paid", order: paidOrder }
  }

  /**
   * After the commit: a paid order is announced (confirmation, new-order
   * push, events, checkout flow); money that must go back is refunded. A
   * refund that fails throws, so the webhook job is retried — the attempt is
   * still open, and the same refund key never refunds twice.
   */
  private async afterSync(outcome: SyncOutcome) {
    if (outcome.kind === "paid") {
      await orderService.afterPaid(outcome.order)
      return
    }
    if (outcome.kind === "refund") {
      await refundAttempt({
        gateway: outcome.gateway,
        payment: outcome.payment,
        transactionId: outcome.transactionId,
        tx: db,
      })
      await this.invalidateCacheTags(`orders:${outcome.payment.workspaceId}`)
    }
  }

  /** Where the provider sends the customer back: their own order page. */
  private async buildReturnUrls(order: OrderModel, contactId: string) {
    const [appUrl, token] = await Promise.all([
      resolveWorkspaceAppUrl({ workspaceId: order.workspaceId }),
      signShopToken({
        workspaceId: order.workspaceId,
        contactId,
        contactInboxId: order.contactInboxId,
        conversationId: order.conversationId,
      }),
    ])
    // `shopToken`, not `token`: PayPal appends its own `token` (its order id)
    // to the return URL.
    const page = joinAppUrl(
      appUrl,
      `/shop/${encodeURIComponent(order.workspaceId)}/orders/${encodeURIComponent(order.id)}?shopToken=${encodeURIComponent(token)}`,
    )
    return {
      returnUrl: `${page}&payment=return`,
      cancelUrl: `${page}&payment=cancelled`,
    }
  }
}

export const orderPaymentService = new OrderPaymentService()
