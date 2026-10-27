import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  isNotNull,
  lt,
} from "@chatbotx.io/database/client"
import type {
  OnlinePaymentProvider,
  OrderPaymentStatus,
} from "@chatbotx.io/database/partials"
import {
  ecommercePaymentProviderModel,
  orderModel,
  orderPaymentModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"

export type PaymentProviderUpsertValues = Omit<
  typeof ecommercePaymentProviderModel.$inferInsert,
  "id" | "createdAt" | "updatedAt"
>

export type OrderPaymentInsertValues = Omit<
  typeof orderPaymentModel.$inferInsert,
  "createdAt" | "updatedAt"
>

export type OrderPaymentUpdateValues = Partial<
  Pick<
    typeof orderPaymentModel.$inferInsert,
    | "status"
    | "transactionId"
    | "refundId"
    | "paidAt"
    | "refundedAt"
    | "expiresAt"
  >
>

export const paymentProviderRepository = {
  async listByWorkspace(workspaceId: string, tx: DatabaseClient = db) {
    return await tx.query.ecommercePaymentProviderModel.findMany({
      where: { workspaceId },
      orderBy: { provider: "asc" },
    })
  },

  async find(
    input: { workspaceId: string; provider: OnlinePaymentProvider },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.ecommercePaymentProviderModel.findFirst({
      where: { workspaceId: input.workspaceId, provider: input.provider },
    })
  },

  /** The workspace a connected Stripe account belongs to, if any. */
  async findByExternalAccount(
    input: {
      provider: OnlinePaymentProvider
      platformCredentialId: string
      externalAccountId: string
    },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.ecommercePaymentProviderModel.findFirst({
      where: {
        provider: input.provider,
        platformCredentialId: input.platformCredentialId,
        externalAccountId: input.externalAccountId,
      },
    })
  },

  /** One connection per provider per workspace: a reconnect replaces it. */
  async upsert(values: PaymentProviderUpsertValues, tx: DatabaseClient = db) {
    const [row] = await tx
      .insert(ecommercePaymentProviderModel)
      .values({ id: createId(), ...values })
      .onConflictDoUpdate({
        target: [
          ecommercePaymentProviderModel.workspaceId,
          ecommercePaymentProviderModel.provider,
        ],
        set: {
          livemode: values.livemode,
          accountLabel: values.accountLabel ?? null,
          externalAccountId: values.externalAccountId ?? null,
          platformCredentialId: values.platformCredentialId ?? null,
          secret: values.secret ?? null,
          webhookEndpointId: values.webhookEndpointId ?? null,
          updatedAt: new Date(),
        },
      })
      .returning()
    return row
  },

  /** Stores connected through one platform Stripe credential. */
  async countByPlatformCredential(
    platformCredentialId: string,
    tx: DatabaseClient = db,
  ) {
    return await tx.$count(
      ecommercePaymentProviderModel,
      eq(
        ecommercePaymentProviderModel.platformCredentialId,
        platformCredentialId,
      ),
    )
  },

  async delete(
    input: { workspaceId: string; provider: OnlinePaymentProvider },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .delete(ecommercePaymentProviderModel)
      .where(
        and(
          eq(ecommercePaymentProviderModel.workspaceId, input.workspaceId),
          eq(ecommercePaymentProviderModel.provider, input.provider),
        ),
      )
      .returning()
    return row
  },
}

export const orderPaymentRepository = {
  /**
   * Orders that still need their provider account: waiting for the money, or
   * paid but still open (cancelling them refunds through that account).
   */
  async countOrdersNeedingProvider(
    input: { workspaceId: string; provider: OnlinePaymentProvider },
    tx: DatabaseClient = db,
  ) {
    return await tx.$count(
      orderModel,
      and(
        eq(orderModel.workspaceId, input.workspaceId),
        eq(orderModel.paymentMethod, input.provider),
        inArray(orderModel.status, ["pending", "accepted", "shipped"]),
        inArray(orderModel.paymentStatus, ["unpaid", "paid"]),
      ),
    )
  },

  /**
   * Open attempts past their page's end: whatever they came to (closed, or
   * money that must go back) is settled by the sweep, even when no webhook
   * or retry is left to do it.
   */
  async listStale(input: { before: Date; limit: number }, tx = db) {
    return await tx
      .select()
      .from(orderPaymentModel)
      .where(
        and(
          eq(orderPaymentModel.status, "open"),
          lt(orderPaymentModel.expiresAt, input.before),
        ),
      )
      .orderBy(orderPaymentModel.expiresAt)
      .limit(input.limit)
  },

  async insert(values: OrderPaymentInsertValues, tx: DatabaseClient = db) {
    const [row] = await tx.insert(orderPaymentModel).values(values).returning()
    return row
  },

  async findById(
    input: { workspaceId: string; id: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.orderPaymentModel.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
    })
  },

  async findByReference(
    input: { provider: OnlinePaymentProvider; providerReference: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.orderPaymentModel.findFirst({
      where: {
        provider: input.provider,
        providerReference: input.providerReference,
      },
    })
  },

  /** Every attempt of an order, newest first. */
  async listByOrder(
    input: { workspaceId: string; orderId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.orderPaymentModel.findMany({
      where: { workspaceId: input.workspaceId, orderId: input.orderId },
      orderBy: { createdAt: "desc", id: "desc" },
    })
  },

  /**
   * Locks one attempt until the transaction ends. Callers lock the order
   * first, so the order and its attempts are always locked in that order.
   */
  async findForUpdate(
    input: { workspaceId: string; id: string },
    tx: DatabaseClient,
  ) {
    const [row] = await tx
      .select()
      .from(orderPaymentModel)
      .where(
        and(
          eq(orderPaymentModel.id, input.id),
          eq(orderPaymentModel.workspaceId, input.workspaceId),
        ),
      )
      .for("update")
    return row
  },

  /**
   * Moves an attempt only while it is still in one of `from`, so two webhooks
   * for the same payment cannot both settle it.
   */
  async updateStatus(
    input: {
      workspaceId: string
      id: string
      from: OrderPaymentStatus[]
      values: OrderPaymentUpdateValues
    },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .update(orderPaymentModel)
      .set({ ...input.values, updatedAt: new Date() })
      .where(
        and(
          eq(orderPaymentModel.id, input.id),
          eq(orderPaymentModel.workspaceId, input.workspaceId),
          inArray(orderPaymentModel.status, input.from),
        ),
      )
      .returning()
    return row
  },
}

export const orderPaymentDueRepository = {
  /**
   * Online orders still waiting for their payment past their deadline, the
   * longest overdue first. Nothing is locked: each one is cancelled under
   * the order's own lock, which also settles a race with a late payment.
   */
  async listOverdue(input: { now: Date; limit: number }, tx = db) {
    return await tx
      .select({
        id: orderModel.id,
        workspaceId: orderModel.workspaceId,
      })
      .from(orderModel)
      .where(
        and(
          eq(orderModel.status, "pending"),
          eq(orderModel.paymentStatus, "unpaid"),
          isNotNull(orderModel.paymentExpiresAt),
          lt(orderModel.paymentExpiresAt, input.now),
        ),
      )
      .orderBy(orderModel.paymentExpiresAt)
      .limit(input.limit)
  },

  /** Pushes an order's deadline back, so one that cannot be settled now
   * (the provider is down) does not hold up the others. */
  async postponeExpiry(
    input: { workspaceId: string; orderId: string; until: Date },
    tx: DatabaseClient = db,
  ) {
    await tx
      .update(orderModel)
      .set({ paymentExpiresAt: input.until })
      .where(
        and(
          eq(orderModel.id, input.orderId),
          eq(orderModel.workspaceId, input.workspaceId),
          eq(orderModel.paymentStatus, "unpaid"),
        ),
      )
  },
}
