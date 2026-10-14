// @vitest-environment jsdom
import type {
  ProductMessageItem,
  ResolvedProductMessage,
} from "@chatbotx.io/sdk"
import type { ComponentProps, ReactNode } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ProductMessageBubble } from "../product-message-bubble"

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

// Embla needs layout APIs jsdom does not have; the slides are all we assert on.
vi.mock("@chatbotx.io/ui/components/ui/carousel", () => ({
  Carousel: ({ children }: { children: ReactNode }) => (
    <div data-testid="carousel">{children}</div>
  ),
  CarouselContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  CarouselItem: ({ children }: ComponentProps<"div">) => (
    <div data-slide>{children}</div>
  ),
  CarouselNext: () => null,
  CarouselPrevious: () => null,
}))

const item = (
  productId: string,
  props: Partial<ProductMessageItem> = {},
): ProductMessageItem => ({
  productId,
  name: `Product ${productId}`,
  imageUrl: null,
  price: 12.5,
  currency: "USD",
  catalogReference: {
    source: "metaCatalog",
    catalogId: "cat-1",
    retailerId: `sku-${productId}`,
  },
  ...props,
})

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

const render = (message: ResolvedProductMessage) =>
  act(() => root.render(<ProductMessageBubble message={message} />))

describe("ProductMessageBubble", () => {
  test("lists products by section with name and formatted price", () => {
    render({
      display: "products",
      header: "Our picks",
      body: "Have a look",
      footer: "Free delivery",
      sections: [
        {
          title: "Shoes",
          items: [item("1"), item("2", { imageUrl: "https://img/2.png" })],
        },
        { title: "Bags", items: [item("3")] },
      ],
    })

    expect(container.textContent).toContain("Our picks")
    expect(container.textContent).toContain("Shoes")
    expect(container.textContent).toContain("Bags")
    expect(container.textContent).toContain("Product 1")
    expect(container.textContent).toContain("$12.50")
    expect(container.textContent).toContain("Free delivery")
    expect(container.querySelectorAll("li")).toHaveLength(3)
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://img/2.png",
    )
  })

  test("does not repeat the header when it already is the message text", () => {
    render({
      display: "products",
      header: "Only a header",
      sections: [{ items: [item("1")] }],
    })

    expect(container.textContent).not.toContain("Only a header")
  })

  test("a carousel shows one slide per product", () => {
    render({
      display: "carousel",
      body: "Look",
      items: [item("1"), item("2"), item("3")],
    })

    expect(container.querySelectorAll("[data-slide]")).toHaveLength(3)
  })

  test("an unknown currency code falls back to plain text instead of crashing", () => {
    render({
      display: "products",
      sections: [
        { items: [item("1", { currency: "NOT-A-CURRENCY", price: 5 })] },
      ],
    })

    expect(container.textContent).toContain("5 NOT-A-CURRENCY")
  })

  test("two sections with the same title render without key collisions", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    render({
      display: "products",
      sections: [
        { title: "Shoes", items: [item("1")] },
        { title: "Shoes", items: [item("2")] },
      ],
    })

    expect(container.querySelectorAll("li")).toHaveLength(2)
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })

  test("a product with no image shows a placeholder, not a broken image", () => {
    render({ display: "products", sections: [{ items: [item("1")] }] })

    expect(container.querySelector("img")).toBeNull()
  })
})
