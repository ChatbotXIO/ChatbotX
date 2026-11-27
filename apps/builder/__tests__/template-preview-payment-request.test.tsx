import type { TemplateComponent } from "@chatbotx.io/flow-config"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}))

vi.mock("next/image", () => ({
  default: () => null,
}))

const { TemplatePreview } = await import(
  "@/features/integration-whatsapp/message-templates/components/template-preview"
)

const components: TemplateComponent[] = [
  { type: "BODY", text: "Pay your order" },
  {
    type: "BUTTONS",
    buttons: [{ type: "PAYMENT_REQUEST", text: "Copy Pix code" }],
  },
]

describe("TemplatePreview payment request button", () => {
  let container: HTMLDivElement
  let root: Root

  const render = (
    buttonParams: Parameters<typeof TemplatePreview>[0]["buttonParams"],
  ) =>
    act(() => {
      root.render(
        <TemplatePreview
          bodyParams={[]}
          buttonParams={buttonParams}
          components={components}
          headerParams={[]}
        />,
      )
    })

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("shows the template's own label before anything is filled", () => {
    render([])
    expect(container.textContent).toContain("Copy Pix code")
    expect(container.textContent).not.toContain("BRL")
  })

  test("adds the method and the amount once they are set", () => {
    render([
      {
        sub_type: "payment_request",
        index: 0,
        payment_request: { method: "pix", code: "x", amount: "12.34" },
      },
    ])
    expect(container.textContent).toContain("Copy Pix code")
    expect(container.textContent).toContain(
      "whatsapp.messageTemplate.params.payment.method.pix",
    )
    expect(container.textContent).toContain("BRL 12.34")
  })

  test("a payment without an amount shows no amount", () => {
    render([
      {
        sub_type: "payment_request",
        index: 0,
        payment_request: { method: "boleto", digitableLine: "1" },
      },
    ])
    expect(container.textContent).not.toContain("BRL")
  })
})
