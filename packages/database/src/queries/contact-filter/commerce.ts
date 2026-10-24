import { type SQL, sql } from "drizzle-orm"
import { operatorTypes } from "../../partials"
import {
  cartModel,
  ecommerceSettingsModel,
  orderItemModel,
  orderModel,
  productModel,
  productVariantModel,
} from "../../schema"
import { existsWhere } from "./exists"
import {
  buildDatetimeAggregateComparison,
  buildNumberAggregateComparison,
} from "./predicates"
import type { ContactWhere, RawTable, RelationExists } from "./types"

/**
 * The orders the purchase conditions count: the contact's, in its workspace,
 * not cancelled, in any currency (changing the store currency must not make
 * old orders vanish from counts, last purchase or bought items).
 */
const countedOrders = (
  table: RawTable,
): SQL => sql`${orderModel.contactId} = ${table.id}
  AND ${orderModel.workspaceId} = ${table.workspaceId}
  AND ${orderModel.status} <> 'cancelled'`

/**
 * Only the money sum is limited to the store currency: orders in another
 * currency (e.g. a cart priced by Meta) are never summed with store-currency
 * ones.
 */
const storeCurrencyOrders = (
  table: RawTable,
): SQL => sql`${countedOrders(table)}
  AND ${orderModel.currency} = COALESCE(
    (SELECT ${ecommerceSettingsModel.currency} FROM ${ecommerceSettingsModel}
      WHERE ${ecommerceSettingsModel.workspaceId} = ${table.workspaceId}),
    ${orderModel.currency}
  )`

/** A line of a counted order, narrowed by `predicate` (e.g. its product). */
export const boughtItemExists: RelationExists = (predicate, negate = false) =>
  existsWhere(
    (_contactId, table) => sql`SELECT 1 FROM ${orderItemModel}
      INNER JOIN ${orderModel} ON ${orderModel.id} = ${orderItemModel.orderId}
      WHERE ${countedOrders(table)}${predicate ? sql` AND ${predicate}` : sql``}`,
    negate,
  )

const aggregateOfOrders = (
  table: RawTable,
  aggregate: SQL,
  where: SQL = countedOrders(table),
): SQL => sql`(SELECT ${aggregate} FROM ${orderModel} WHERE ${where})`

/**
 * Total spent / number of orders. A contact who never bought counts as 0, so
 * "spent less than 100" also finds them.
 */
export function buildOrderNumberWhere(
  aggregate: "totalSpent" | "numberOfOrders",
  operator: string,
  value: unknown,
): ContactWhere {
  const of = (table: RawTable) =>
    sql`COALESCE(${
      aggregate === "totalSpent"
        ? aggregateOfOrders(
            table,
            sql`SUM(${orderModel.total})`,
            storeCurrencyOrders(table),
          )
        : aggregateOfOrders(table, sql`COUNT(*)`)
    }, 0)`
  // Probe whether the operator/value are usable before building per table.
  if (!buildNumberAggregateComparison(operator, value, sql`0`)) {
    return {}
  }
  return {
    RAW: (table: RawTable) =>
      buildNumberAggregateComparison(operator, value, of(table)) ?? sql`FALSE`,
  }
}

/** The date of the contact's latest counted order; empty when they never bought. */
export function buildLastPurchaseWhere(
  operator: string,
  value: unknown,
  timezone: string,
): ContactWhere {
  if (!buildDatetimeAggregateComparison(operator, value, sql`NULL`, timezone)) {
    return {}
  }
  return {
    RAW: (table: RawTable) =>
      buildDatetimeAggregateComparison(
        operator,
        value,
        aggregateOfOrders(table, sql`MAX(${orderModel.createdAt})`),
        timezone,
      ) ?? sql`FALSE`,
  }
}

const cartItems = (table: RawTable, predicate?: SQL): SQL => sql`SELECT 1
  FROM ${cartModel} CROSS JOIN LATERAL jsonb_array_elements(${cartModel.items}) AS "cartItem"
  WHERE ${cartModel.contactId} = ${table.id}
    AND ${cartModel.workspaceId} = ${table.workspaceId}${predicate ? sql` AND ${predicate}` : sql``}`

const toValues = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [value]).filter(
    (item): item is string => typeof item === "string" && item !== "",
  )

/**
 * The web shop cart holds a product: `eq`/`in` one of them, `ne`/`notIn`
 * none of them (a contact without a cart included), `isEmpty` an empty or
 * missing cart.
 */
export function buildCartContainsWhere(
  operator: string,
  value: unknown,
): ContactWhere {
  if (operator === operatorTypes.enum.isEmpty) {
    return existsWhere((_contactId, table) => cartItems(table), true)
  }
  const values = toValues(value)
  if (values.length === 0) {
    return {}
  }
  const positive =
    operator === operatorTypes.enum.eq || operator === operatorTypes.enum.in
  const negative =
    operator === operatorTypes.enum.ne || operator === operatorTypes.enum.notIn
  if (!(positive || negative)) {
    return {}
  }
  const ids = sql.join(
    values.map((id) => sql`${id}`),
    sql`, `,
  )
  return existsWhere(
    (_contactId, table) =>
      cartItems(table, sql`"cartItem"->>'productId' IN (${ids})`),
    negative,
  )
}

/** `eq true`: no item in the web shop cart (or no cart); `eq false`: some. */
export function buildCartIsEmptyWhere(
  operator: string,
  value: unknown,
): ContactWhere {
  if (operator !== operatorTypes.enum.eq) {
    return {}
  }
  return existsWhere((_contactId, table) => cartItems(table), value === "true")
}

/**
 * The cart's value at today's prices — the cart keeps no prices. `subtotal`
 * is before the products' own discounts, `total` after them. An empty or
 * missing cart is 0.
 */
export function buildCartValueWhere(
  kind: "subtotal" | "total",
  operator: string,
  value: unknown,
): ContactWhere {
  if (!buildNumberAggregateComparison(operator, value, sql`0`)) {
    return {}
  }
  const unitPrice = sql`COALESCE(${productVariantModel.price}, ${productModel.price})`
  const lineValue =
    kind === "subtotal"
      ? sql`("cartItem"->>'quantity')::numeric * ${unitPrice}`
      : sql`("cartItem"->>'quantity')::numeric * ${unitPrice} * (1 - ${productModel.discount} / 100.0)`
  const of = (table: RawTable) => sql`COALESCE((
    SELECT SUM(${lineValue})
    FROM ${cartModel}
    CROSS JOIN LATERAL jsonb_array_elements(${cartModel.items}) AS "cartItem"
    INNER JOIN ${productModel}
      ON ${productModel.id} = ("cartItem"->>'productId')::bigint
      AND ${productModel.workspaceId} = ${cartModel.workspaceId}
    LEFT JOIN ${productVariantModel}
      ON ${productVariantModel.id} = NULLIF("cartItem"->>'variantId', '')::bigint
    WHERE ${cartModel.contactId} = ${table.id}
      AND ${cartModel.workspaceId} = ${table.workspaceId}
  ), 0)`
  return {
    RAW: (table: RawTable) =>
      buildNumberAggregateComparison(operator, value, of(table)) ?? sql`FALSE`,
  }
}
