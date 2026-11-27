import { describe, expect, it } from "vitest"
import { changeLine } from "../service"

const cart = [
  { productId: "a", variantId: null, quantity: 1 },
  { productId: "b", variantId: null, quantity: 2 },
  { productId: "c", variantId: "c1", quantity: 3 },
]

const lineSummaries = (lines: typeof cart) =>
  lines.map((line) => `${line.productId}:${line.quantity}`)

describe("changeLine", () => {
  it("keeps an existing line in place when its quantity is set", () => {
    const next = changeLine(
      cart,
      { productId: "a", variantId: null, quantity: 5 },
      "set",
    )
    expect(lineSummaries(next)).toEqual(["a:5", "b:2", "c:3"])
  })

  it("keeps an existing line in place when quantity is added", () => {
    const next = changeLine(
      cart,
      { productId: "b", variantId: null, quantity: 1 },
      "add",
    )
    expect(lineSummaries(next)).toEqual(["a:1", "b:3", "c:3"])
  })

  it("matches the variant, not just the product", () => {
    const next = changeLine(
      cart,
      { productId: "c", variantId: "c2", quantity: 1 },
      "add",
    )
    expect(lineSummaries(next)).toEqual(["a:1", "b:2", "c:3", "c:1"])
  })

  it("appends a new line at the end", () => {
    const next = changeLine(
      cart,
      { productId: "d", variantId: null, quantity: 1 },
      "add",
    )
    expect(lineSummaries(next)).toEqual(["a:1", "b:2", "c:3", "d:1"])
  })

  it("removes the line when the quantity drops to zero", () => {
    const next = changeLine(
      cart,
      { productId: "b", variantId: null, quantity: -2 },
      "add",
    )
    expect(lineSummaries(next)).toEqual(["a:1", "c:3"])
  })

  it("caps the quantity", () => {
    const next = changeLine(
      cart,
      { productId: "a", variantId: null, quantity: 50_000 },
      "set",
    )
    expect(next[0]?.quantity).toBe(10_000)
  })
})
