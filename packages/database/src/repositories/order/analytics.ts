import {
  and,
  type DatabaseClient,
  db,
  desc,
  eq,
  gte,
  lte,
  ne,
  type SQL,
  sql,
} from "@chatbotx.io/database/client"
import {
  zonedBucketKey,
  zonedHourKey,
} from "@chatbotx.io/database/queries/date-bucket"
import { orderItemModel, orderModel } from "@chatbotx.io/database/schema"

/**
 * The orders a sales figure counts: this workspace's, not cancelled, in one
 * currency (a cart priced by Meta in another currency is never summed with
 * store-currency orders), optionally within `[since, until]`.
 */
export type SalesScope = {
  workspaceId: string
  currency: string
  since?: Date
  until?: Date
}

const countedOrders = (scope: SalesScope): SQL | undefined =>
  and(
    eq(orderModel.workspaceId, scope.workspaceId),
    ne(orderModel.status, "cancelled"),
    eq(orderModel.currency, scope.currency),
    scope.since ? gte(orderModel.createdAt, scope.since) : undefined,
    scope.until ? lte(orderModel.createdAt, scope.until) : undefined,
  )

// numeric sums come back as strings; a scope with no order sums to null.
const toNumber = (value: unknown) => Number(value ?? 0)

export const orderAnalyticsRepository = {
  /** Sales (order totals), order count and items sold in the scope. */
  async summary(scope: SalesScope, tx: DatabaseClient = db) {
    const where = countedOrders(scope)
    const [[orders], [items]] = await Promise.all([
      tx
        .select({
          sales: sql<string>`sum(${orderModel.total})`,
          orders: sql<number>`count(*)::int`,
        })
        .from(orderModel)
        .where(where),
      tx
        .select({ products: sql<string>`sum(${orderItemModel.quantity})` })
        .from(orderItemModel)
        .innerJoin(orderModel, eq(orderModel.id, orderItemModel.orderId))
        .where(where),
    ])
    return {
      sales: toNumber(orders?.sales),
      orders: toNumber(orders?.orders),
      products: toNumber(items?.products),
    }
  },

  /**
   * Sales and orders per local hour (`YYYY-MM-DDTHH`) or day (`YYYY-MM-DD`)
   * in `timezone`. Buckets without orders are left out; the caller fills them.
   */
  async series(
    scope: SalesScope & {
      since: Date
      until: Date
      timezone: string
      granularity: "hour" | "day"
    },
    tx: DatabaseClient = db,
  ) {
    const key =
      scope.granularity === "hour"
        ? zonedHourKey(orderModel.createdAt, scope.timezone)
        : zonedBucketKey(orderModel.createdAt, "day", scope.timezone)
    const rows = await tx
      .select({
        key,
        sales: sql<string>`sum(${orderModel.total})`,
        orders: sql<number>`count(*)::int`,
      })
      .from(orderModel)
      .where(countedOrders(scope))
      // By position: the key's bound timezone makes a repeated expression
      // a different one to PostgreSQL.
      .groupBy(sql`1`)
      .orderBy(sql`1`)
    return rows.map((row) => ({
      key: row.key,
      sales: toNumber(row.sales),
      orders: toNumber(row.orders),
    }))
  },

  /** Best-selling products by line totals, named as they were ordered. */
  async topProducts(
    scope: SalesScope & { limit: number },
    tx: DatabaseClient = db,
  ) {
    const sales = sql<string>`sum(${orderItemModel.lineTotal})`
    const rows = await tx
      .select({
        productId: orderItemModel.productId,
        name: sql<string>`max(${orderItemModel.name})`,
        quantity: sql<string>`sum(${orderItemModel.quantity})`,
        sales,
      })
      .from(orderItemModel)
      .innerJoin(orderModel, eq(orderModel.id, orderItemModel.orderId))
      .where(countedOrders(scope))
      // A deleted product keeps its lines (productId null): grouped by name.
      .groupBy(
        orderItemModel.productId,
        sql`case when ${orderItemModel.productId} is null then ${orderItemModel.name} end`,
      )
      .orderBy(desc(sales))
      .limit(scope.limit)
    return rows.map((row) => ({
      productId: row.productId,
      name: row.name,
      quantity: toNumber(row.quantity),
      sales: toNumber(row.sales),
    }))
  },

  /** Best-selling vendors by line totals; lines without a vendor are left out. */
  async topVendors(
    scope: SalesScope & { limit: number },
    tx: DatabaseClient = db,
  ) {
    const sales = sql<string>`sum(${orderItemModel.lineTotal})`
    const rows = await tx
      .select({
        vendorId: orderItemModel.vendorId,
        name: sql<string>`max(${orderItemModel.vendorName})`,
        sales,
      })
      .from(orderItemModel)
      .innerJoin(orderModel, eq(orderModel.id, orderItemModel.orderId))
      .where(
        and(
          countedOrders(scope),
          sql`${orderItemModel.vendorName} is not null`,
        ),
      )
      .groupBy(
        orderItemModel.vendorId,
        sql`case when ${orderItemModel.vendorId} is null then ${orderItemModel.vendorName} end`,
      )
      .orderBy(desc(sales))
      .limit(scope.limit)
    return rows.map((row) => ({
      vendorId: row.vendorId,
      name: row.name,
      sales: toNumber(row.sales),
    }))
  },
}
