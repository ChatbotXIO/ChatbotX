import type { ParameterInfo } from "@chatbotx.io/flow-config"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@/components/tiptap/tiptap-editor-field", () => ({
  TiptapEditorField: ({ name }: { name: string }) => (
    <input data-testid="payment-field" name={name} readOnly />
  ),
}))

const { PaymentRequestParamField } = await import(
  "@/features/integration-whatsapp/message-templates/components/payment-request-param-field"
)

const paymentParam = (
  paymentMethod: ParameterInfo["paymentMethod"],
): ParameterInfo => ({
  type: "button",
  index: 0,
  paramName: "payment_request",
  buttonSubType: "payment_request",
  paymentMethod,
})

function Harness({
  param,
  storedMethod,
}: {
  param: ParameterInfo
  storedMethod: string | undefined
}) {
  const form = useForm({
    defaultValues: {
      params: { button: [{ payment_request: { method: storedMethod } }] },
    },
  })
  return (
    <FormProvider {...form}>
      <PaymentRequestParamField fieldName="params.button[0]" param={param} />
    </FormProvider>
  )
}

describe("PaymentRequestParamField", () => {
  let container: HTMLDivElement
  let root: Root

  const render = (param: ParameterInfo, storedMethod?: string) =>
    act(() => {
      root.render(
        <Harness
          key={`${param.paymentMethod}-${storedMethod}`}
          param={param}
          storedMethod={storedMethod ?? param.paymentMethod}
        />,
      )
    })

  const fieldNames = () =>
    Array.from(container.querySelectorAll("[data-testid=payment-field]")).map(
      (input) => input.getAttribute("name"),
    )

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test.each([
    ["pix", ["code", "amount"]],
    ["boleto", ["digitableLine"]],
    ["payment_link", ["url"]],
    ["card_on_file", ["lastFourDigits", "amount", "credentialId"]],
  ] as const)("%s asks only for its own per-customer values", (method, fields) => {
    render(paymentParam(method))

    expect(fieldNames()).toEqual(
      fields.map((field) => `params.button[0].payment_request.${field}`),
    )
    expect(container.textContent).toContain(
      `whatsapp.messageTemplate.params.payment.method.${method}`,
    )
  })

  test("shows one short note, plus the card note only for one-click card", () => {
    render(paymentParam("pix"))
    expect(container.textContent).toContain("notice.general")
    expect(container.textContent).not.toContain("notice.cardOnFile")

    render(paymentParam("card_on_file"))
    expect(container.textContent).toContain("notice.general")
    expect(container.textContent).toContain("notice.cardOnFile")
  })

  test("waits for the form to hold this template's method before mounting editors", () => {
    // After a template change the form still holds the old method until the
    // parent resets it; mounting now would show the old template's values.
    render(paymentParam("pix"), "card_on_file")
    expect(fieldNames()).toEqual([])

    render(paymentParam("pix"), undefined)
    expect(fieldNames()).toEqual([
      "params.button[0].payment_request.code",
      "params.button[0].payment_request.amount",
    ])
  })

  test("renders nothing when the template method is unknown", () => {
    render(paymentParam(undefined))
    expect(container.innerHTML).toBe("")
  })
})
