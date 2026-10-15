// @vitest-environment jsdom
import type {
  MessageInboundOrderEntity,
  ResolvedInboundProductReference,
} from "@chatbotx.io/sdk"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { InboundOrderBubble } from "../inbound-order-bubble"
import { ReferredProductContext } from "../referred-product-context"

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}))

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // biome-ignore lint/performance/noImgElement: test double for next/image
    <img alt={alt} height={1} src={src} width={1} />
  ),
}))

const reference = (
  retailerId: string,
  product: ResolvedInboundProductReference["product"],
): ResolvedInboundProductReference => ({
  catalogReference: { source: "metaCatalog", catalogId: "cat-1", retailerId },
  product,
})
const named = (name: string, imageUrl: string | null = null) => ({
  productId: `id-${name}`,
  name,
  imageUrl,
  price: 10,
  currency: "USD",
})
const line = (
  ref: ResolvedInboundProductReference,
  quantity: number,
  itemPrice = 10,
) => ({ ...ref, quantity, itemPrice, currency: "USD" })

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const renderOrder = (order: MessageInboundOrderEntity) =>
  act(() => root.render(<InboundOrderBubble order={order} />))

describe("InboundOrderBubble", () => {
  test("lists each item with its name, quantity and price, and the note", () => {
    renderOrder({
      note: "after 5pm",
      items: [
        line(reference("sku-1", named("Red shoes", "https://img/1.png")), 2),
        line(reference("sku-2", named("Blue bag")), 1, 4.5),
      ],
    })

    expect(container.textContent).toContain("title")
    expect(container.textContent).toContain("Red shoes")
    expect(container.textContent).toContain("2 × $10.00")
    expect(container.textContent).toContain("Blue bag")
    expect(container.textContent).toContain("1 × $4.50")
    expect(container.textContent).toContain("note: after 5pm")
    expect(container.querySelectorAll("li")).toHaveLength(2)
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://img/1.png",
    )
  })

  test("an item the workspace could not match keeps the channel's id and is flagged", () => {
    renderOrder({
      note: null,
      items: [line(reference("sku-unknown", null), 3)],
    })

    expect(container.textContent).toContain("sku-unknown")
    expect(container.textContent).toContain("3 × $10.00")
    expect(container.textContent).toContain("unresolvedProduct")
  })

  test("a cart that lists one item twice shows both lines", () => {
    renderOrder({
      note: null,
      items: [
        line(reference("sku-1", named("Shoes")), 1),
        line(reference("sku-1", named("Shoes")), 3),
      ],
    })

    expect(container.querySelectorAll("li")).toHaveLength(2)
  })

  test("shows no note line when there is no note", () => {
    renderOrder({ note: null, items: [line(reference("sku-1", null), 1)] })

    expect(container.textContent).not.toContain("note")
  })
})

describe("ReferredProductContext", () => {
  const renderReference = (ref: ResolvedInboundProductReference) =>
    act(() => root.render(<ReferredProductContext reference={ref} />))

  test("shows the product the contact asked about", () => {
    renderReference(reference("sku-1", named("Red shoes")))

    expect(container.textContent).toContain("Red shoes")
    expect(container.textContent).toContain("askedAbout")
  })

  test("falls back to the channel's id when the product is not in the workspace", () => {
    renderReference(reference("sku-unknown", null))

    expect(container.textContent).toContain("sku-unknown")
    expect(container.textContent).toContain("askedAbout")
  })
})
