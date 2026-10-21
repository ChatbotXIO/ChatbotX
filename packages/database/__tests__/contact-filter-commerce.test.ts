import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test } from "vitest"
import { applyContactFilter } from "../src/queries/contact-filter"
import { contactModel } from "../src/schema"

const STARTS_EXISTS = /^EXISTS \(/
const STARTS_NOT_EXISTS = /^NOT EXISTS \(/

/** The SQL of a one-condition filter, or null when it produces no predicate. */
const render = (condition: Record<string, unknown>) => {
  const where = applyContactFilter({ operator: "and", conditions: [condition] })
  const raw = (where as { AND?: Array<{ RAW?: unknown }> }).AND?.[0]?.RAW
  if (typeof raw !== "function") {
    return null
  }
  return new PgDialect().sqlToQuery(
    (raw as (table: typeof contactModel) => SQL)(contactModel),
  )
}

describe("purchase conditions", () => {
  test("total spent sums the contact's orders that are not cancelled, 0 when none", () => {
    const query = render({ field: "totalSpent", operator: "gte", value: "100" })
    expect(query?.sql).toContain('SUM("Order"."total")')
    expect(query?.sql).toContain(`"Order"."status" <> 'cancelled'`)
    expect(query?.sql).toContain("COALESCE(")
    expect(query?.sql).toContain(">=")
    expect(query?.params).toContain(100)
  })

  test("number of orders counts them", () => {
    const query = render({
      field: "numberOfOrders",
      operator: "eq",
      value: "0",
    })
    expect(query?.sql).toContain("COUNT(*)")
  })

  test("orders in another currency than the store's are not counted", () => {
    const query = render({ field: "totalSpent", operator: "gt", value: "0" })
    expect(query?.sql).toContain('"EcommerceSettings"."currency"')
  })

  test("a non-numeric amount gives no predicate", () => {
    expect(
      render({ field: "totalSpent", operator: "gt", value: "lots" }),
    ).toBeNull()
  })

  test("bought compares the latest order's date", () => {
    const query = render({
      field: "bought",
      operator: "gte",
      value: "2026-10-01",
    })
    expect(query?.sql).toContain('MAX("Order"."createdAt")')
  })

  test("bought the items: a product of a counted order", () => {
    const query = render({ field: "boughtItems", operator: "eq", value: "42" })
    expect(query?.sql).toMatch(STARTS_EXISTS)
    expect(query?.sql).toContain('"OrderItem"."productId" IN')
  })

  test("not bought the items also finds contacts who never bought", () => {
    const query = render({ field: "boughtItems", operator: "ne", value: "42" })
    expect(query?.sql).toMatch(STARTS_NOT_EXISTS)
  })

  test("a malformed product id is dropped instead of failing the query", () => {
    const query = render({
      field: "boughtItems",
      operator: "in",
      value: ["abc", "42", "99999999999999999999"],
    })
    expect(query?.sql).not.toContain("abc")
    expect(query?.params).toEqual(expect.arrayContaining(["42"]))
    expect(query?.params).not.toContain("99999999999999999999")
    const none = render({ field: "boughtItems", operator: "eq", value: "abc" })
    expect(none?.sql).toMatch(STARTS_EXISTS)
    expect(none?.sql).not.toContain("::bigint")
  })

  test("never bought anything", () => {
    const query = render({ field: "boughtItems", operator: "isEmpty" })
    expect(query?.sql).toMatch(STARTS_NOT_EXISTS)
    expect(query?.sql).not.toContain('"OrderItem"."productId" IN')
  })
})

describe("web shop cart conditions", () => {
  test("cart contains a product", () => {
    const query = render({
      field: "shoppingCartContainsItems",
      operator: "eq",
      value: "42",
    })
    expect(query?.sql).toMatch(STARTS_EXISTS)
    expect(query?.sql).toContain("jsonb_array_elements")
    expect(query?.sql).toContain(`"cartItem"->>'productId' IN`)
    expect(query?.params).toContain("42")
  })

  test("cart without the product includes contacts without a cart", () => {
    expect(
      render({
        field: "shoppingCartContainsItems",
        operator: "ne",
        value: "42",
      })?.sql,
    ).toMatch(STARTS_NOT_EXISTS)
  })

  test("cart is empty: no item at all", () => {
    expect(
      render({ field: "shoppingCartIsEmpty", operator: "eq", value: "true" })
        ?.sql,
    ).toMatch(STARTS_NOT_EXISTS)
    expect(
      render({ field: "shoppingCartIsEmpty", operator: "eq", value: "false" })
        ?.sql,
    ).toMatch(STARTS_EXISTS)
  })

  test("cart value is priced at today's product or variant price", () => {
    const subtotal = render({
      field: "shoppingCartSubtotal",
      operator: "gt",
      value: "50",
    })
    expect(subtotal?.sql).toContain(
      'COALESCE("ProductVariant"."price", "Product"."price")',
    )
    expect(subtotal?.sql).not.toContain('"Product"."discount"')
    const total = render({
      field: "shoppingCartTotal",
      operator: "gt",
      value: "50",
    })
    expect(total?.sql).toContain('"Product"."discount"')
  })
})
