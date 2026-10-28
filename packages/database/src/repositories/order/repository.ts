import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  ne,
  relationsFilterToSQL,
} from "@chatbotx.io/database/client"
import type { OrderSource, OrderStatus } from "@chatbotx.io/database/partials"
import {
  orderItemModel,
  orderModel,
  orderStatusHistoryModel,
} from "@chatbotx.io/database/schema"
import {
  likeContains,
  parseOrderByAsObject,
  parsePagination,
} from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"

export type OrderListInput = {
  workspaceId: string
  status?: OrderStatus[] | null
  source?: OrderSource[] | null
  contactId?: string | null
  /** Inclusive lower bound on `createdAt`. */
  from?: Date | null
  /** Exclusive upper bound on `createdAt`. */
  to?: Date | null
  /** An order number, or part of the customer's name, phone or email. */
  keyword?: string | null
  page?: number
  perPage?: number
  sort?: { id: string; desc: boolean }[] | null
}

export type OrderInsertValues = Omit<
  typeof orderModel.$inferInsert,
  "id" | "createdAt" | "updatedAt"
>
export type OrderItemInsertValues = Omit<
  typeof orderItemModel.$inferInsert,
  "id" | "orderId" | "workspaceId" | "createdAt" | "updatedAt"
>
export type OrderHistoryInsertValues = Omit<
  typeof orderStatusHistoryModel.$inferInsert,
  "id" | "createdAt" | "updatedAt"
>
export type OrderUpdateValues = Partial<
  Omit<OrderInsertValues, "workspaceId" | "number" | "source">
>

const ORDER_NUMBER_PATTERN = /^#?(\d{1,15})$/

const buildListWhere = (input: OrderListInput) => {
  const keyword = input.keyword?.trim()
  const numberMatch = keyword ? ORDER_NUMBER_PATTERN.exec(keyword) : null
  const createdAt =
    input.from || input.to
      ? {
          ...(input.from ? { gte: input.from } : {}),
          ...(input.to ? { lt: input.to } : {}),
        }
      : undefined
  return {
    workspaceId: input.workspaceId,
    status: input.status?.length ? { in: input.status } : undefined,
    source: input.source?.length ? { in: input.source } : undefined,
    contactId: input.contactId ?? undefined,
    createdAt,
    ...(keyword
      ? {
          OR: [
            ...(numberMatch ? [{ number: Number(numberMatch[1]) }] : []),
            { customerName: { ilike: likeContains(keyword) } },
            { customerPhone: { ilike: likeContains(keyword) } },
            { customerEmail: { ilike: likeContains(keyword) } },
          ],
        }
      : {}),
  }
}

export const orderRepository = {
  async list(input: OrderListInput, tx: DatabaseClient = db) {
    const where = buildListWhere(input)
    const pagination = parsePagination(input)
    const orderBy = parseOrderByAsObject(orderModel, input)

    const [rows, total] = await Promise.all([
      tx.query.orderModel.findMany({
        where,
        with: { items: { columns: { quantity: true } } },
        orderBy: Object.keys(orderBy).length > 0 ? orderBy : { number: "desc" },
        ...pagination,
      }),
      tx.$count(orderModel, relationsFilterToSQL(orderModel, where)),
    ])

    return {
      data: rows.map(({ items, ...order }) => ({
        ...order,
        itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      })),
      pageCount: pagination?.limit ? Math.ceil(total / pagination.limit) : 1,
    }
  },

  async findDetail(
    input: { workspaceId: string; orderId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.orderModel.findFirst({
      where: { id: input.orderId, workspaceId: input.workspaceId },
      with: {
        items: { orderBy: { id: "asc" } },
        history: {
          orderBy: { createdAt: "asc", id: "asc" },
          with: { actorUser: { columns: { id: true, name: true } } },
        },
        payments: { orderBy: { createdAt: "desc", id: "desc" } },
      },
    })
  },

  /**
   * Marks an online order paid, only while it is still unpaid and not
   * cancelled: of two payments landing at once only one wins, and a payment
   * for a cancelled order changes nothing (it is refunded instead).
   */
  async markPaid(
    input: { workspaceId: string; orderId: string; paidAt: Date },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .update(orderModel)
      .set({
        paymentStatus: "paid",
        paidAt: input.paidAt,
        paymentExpiresAt: null,
      })
      .where(
        and(
          eq(orderModel.id, input.orderId),
          eq(orderModel.workspaceId, input.workspaceId),
          eq(orderModel.paymentStatus, "unpaid"),
          ne(orderModel.status, "cancelled"),
        ),
      )
      .returning()
    return row
  },

  async find(
    input: { workspaceId: string; orderId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.orderModel.findFirst({
      where: { id: input.orderId, workspaceId: input.workspaceId },
    })
  },

  /**
   * Locks the order until the transaction ends, so a status move and a
   * delete of the same order run one after the other and each reads the
   * status the other left.
   */
  async findForUpdate(
    input: { workspaceId: string; orderId: string },
    tx: DatabaseClient,
  ) {
    const [row] = await tx
      .select()
      .from(orderModel)
      .where(
        and(
          eq(orderModel.id, input.orderId),
          eq(orderModel.workspaceId, input.workspaceId),
        ),
      )
      .for("update")
    return row
  },

  async insert(values: OrderInsertValues, tx: DatabaseClient = db) {
    const [row] = await tx
      .insert(orderModel)
      .values({ id: createId(), ...values })
      .returning()
    return row
  },

  /** Deletes the order; its lines and history go with it (cascade). */
  async delete(
    input: { workspaceId: string; orderId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .delete(orderModel)
      .where(
        and(
          eq(orderModel.id, input.orderId),
          eq(orderModel.workspaceId, input.workspaceId),
        ),
      )
      .returning()
    return row
  },

  async insertItems(
    input: {
      workspaceId: string
      orderId: string
      items: OrderItemInsertValues[]
    },
    tx: DatabaseClient = db,
  ) {
    if (input.items.length === 0) {
      return []
    }
    return await tx
      .insert(orderItemModel)
      .values(
        input.items.map((item) => ({
          id: createId(),
          orderId: input.orderId,
          workspaceId: input.workspaceId,
          ...item,
        })),
      )
      .returning()
  },

  async insertHistory(
    values: OrderHistoryInsertValues,
    tx: DatabaseClient = db,
  ) {
    await tx
      .insert(orderStatusHistoryModel)
      .values({ id: createId(), ...values })
  },

  /**
   * Moves the order to `to` only while it is still in one of `from`. Two
   * members clicking different buttons at once cannot both win: the second
   * update matches no row and gets `undefined`.
   */
  async transitionStatus(
    input: {
      workspaceId: string
      orderId: string
      from: OrderStatus[]
      to: OrderStatus
      values?: OrderUpdateValues
    },
    tx: DatabaseClient = db,
  ) {
    if (input.from.length === 0) {
      return
    }
    const [row] = await tx
      .update(orderModel)
      .set({ ...input.values, status: input.to })
      .where(
        and(
          eq(orderModel.id, input.orderId),
          eq(orderModel.workspaceId, input.workspaceId),
          inArray(orderModel.status, input.from),
        ),
      )
      .returning()
    return row
  },

  /** The customer's rating of their own order. */
  async setRating(
    input: {
      workspaceId: string
      orderId: string
      rating: number
      ratingComment: string | null
    },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .update(orderModel)
      .set({ rating: input.rating, ratingComment: input.ratingComment })
      .where(
        and(
          eq(orderModel.id, input.orderId),
          eq(orderModel.workspaceId, input.workspaceId),
        ),
      )
      .returning()
    return row
  },

  async listItems(
    input: { workspaceId: string; orderId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx
      .select()
      .from(orderItemModel)
      .where(
        and(
          eq(orderItemModel.orderId, input.orderId),
          eq(orderItemModel.workspaceId, input.workspaceId),
        ),
      )
  },
}
