// @vitest-environment jsdom
import { sendViewCatalogStepDefaultFn } from "@chatbotx.io/flow-config"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import SendViewCatalogStepViewer from "../viewer"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@/features/coupons/provider/use-coupon-topic-options", () => ({
  useCouponTopicOptions: () => ({ labelById: new Map<string, string>() }),
}))

vi.mock("@/components/tiptap/use-bot-field-token-labels", () => ({
  useBotFieldTokenLabels: (text: string) => text,
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const render = (data: ReturnType<typeof sendViewCatalogStepDefaultFn>) => {
  act(() => {
    root.render(<SendViewCatalogStepViewer data={data} />)
  })
}

describe("send view catalog viewer", () => {
  test("shows the body and the fixed catalog button", () => {
    render(sendViewCatalogStepDefaultFn({ text: "Browse our catalog" }))

    expect(container.textContent).toContain("Browse our catalog")
    expect(container.textContent).toContain("flows.actions.sendViewCatalog")
  })

  test("keeps the body's line breaks", () => {
    render(sendViewCatalogStepDefaultFn({ text: "one\ntwo" }))

    expect(container.querySelector("p")?.className).toContain(
      "whitespace-pre-line",
    )
  })

  test("wraps an unbroken string and clips a long body so the node stays compact", () => {
    render(sendViewCatalogStepDefaultFn({ text: "a".repeat(1000) }))
    const className = container.querySelector("p")?.className ?? ""

    expect(className).toContain("break-words")
    expect(className).toContain("line-clamp-")
  })

  test("renders the footer only when one is set", () => {
    render(sendViewCatalogStepDefaultFn({ text: "Hi" }))
    expect(container.textContent).not.toContain("Free shipping")

    render(
      sendViewCatalogStepDefaultFn({ text: "Hi", footer: "Free shipping" }),
    )
    expect(container.textContent).toContain("Free shipping")
  })

  test("an empty draft renders without crashing", () => {
    render(sendViewCatalogStepDefaultFn())

    expect(container.textContent).toContain("flows.actions.sendViewCatalog")
  })
})
