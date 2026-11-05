import type {
  TemplateComponent,
  TemplateComponentButton,
} from "@chatbotx.io/flow-config"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, type UseFormReturn, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

// Heavy collaborators of unrelated button types; the payment field is real.
vi.mock("@/components/tiptap/tiptap-editor-field", () => ({
  TiptapEditorField: ({ name }: { name: string }) => (
    <input data-testid="editor" name={name} readOnly />
  ),
}))
vi.mock("@/features/custom-fields/create-custom-field", () => ({
  CreateCustomFieldDialog: () => null,
}))
vi.mock("@/features/custom-fields/custom-field-select", () => ({
  CustomFieldSelect: () => null,
}))
vi.mock("@/features/custom-fields/provider/custom-field-hook", () => ({
  useInvalidateCustomFields: () => vi.fn(),
}))
vi.mock(
  "@/features/flows/react-flow/stores/whatsapp-flow-store-provider",
  () => ({ useWhatsappFlow: () => [] }),
)
vi.mock(
  "@/features/integration-whatsapp/flows/flow-file-mapping-field",
  () => ({
    FILE_ANSWER_CUSTOM_FIELD_TYPES: [],
    FlowFileAnswerBadge: () => null,
    FlowFileMappingField: () => null,
  }),
)
vi.mock(
  "@/features/integration-whatsapp/flows/lib/build-flow-field-mappings",
  () => ({ buildFlowFieldMappings: vi.fn(), collectFlowOutputs: vi.fn() }),
)
vi.mock("@/hooks/routing", () => ({ useWorkspaceId: () => "ws-1" }))
vi.mock("@/lib/orpc/orpc", () => ({ client: {} }))
vi.mock(
  "@/features/integration-whatsapp/message-templates/components/meta-catalog-product-select",
  () => ({ MetaCatalogProductSelect: () => null }),
)
vi.mock(
  "@/features/integration-whatsapp/message-templates/components/mpm-sections-field",
  () => ({ MpmSectionsField: () => null }),
)

const { TemplateParamsForm } = await import(
  "@/features/integration-whatsapp/message-templates/components/template-params-form"
)

const buttons = (...list: TemplateComponentButton[]): TemplateComponent[] => [
  { type: "BUTTONS", buttons: list },
]
const pix = {
  type: "PAYMENT_REQUEST",
  text: "Copy Pix code",
  payment_setting: { type: "pix_dynamic_code" },
}
const boleto = { type: "PAYMENT_REQUEST", text: "Copy Boleto code" }

type FormValues = {
  params?: {
    button?: Array<{
      sub_type?: string
      index?: number
      payment_request?: Record<string, string>
    }>
  }
}

describe("TemplateParamsForm payment request button", () => {
  let container: HTMLDivElement
  let root: Root
  let form: UseFormReturn<FormValues>

  function Harness({
    components,
    defaultValues,
  }: {
    components: TemplateComponent[]
    defaultValues: FormValues
  }) {
    form = useForm<FormValues>({ defaultValues })
    return (
      <FormProvider {...form}>
        <TemplateParamsForm components={components} parentName="params" />
      </FormProvider>
    )
  }

  const render = (components: TemplateComponent[], defaultValues: FormValues) =>
    act(() => {
      root.render(
        <Harness components={components} defaultValues={defaultValues} />,
      )
    })

  const rerender = (components: TemplateComponent[]) =>
    act(() => {
      root.render(<Harness components={components} defaultValues={{}} />)
    })

  const slot = () => form.getValues("params.button.0")

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("seeds the slot with the template's button index and a blank request of its method", () => {
    render(buttons({ type: "QUICK_REPLY", text: "Later" }, pix), {})

    expect(slot()).toMatchObject({
      sub_type: "payment_request",
      index: 1,
      payment_request: { method: "pix", code: "" },
    })
  })

  test("keeps what the user already typed when the method matches", () => {
    render(buttons(pix), {
      params: {
        button: [
          {
            payment_request: { method: "pix", code: "000201", amount: "5" },
          },
        ],
      },
    })

    expect(slot()?.payment_request).toEqual({
      method: "pix",
      code: "000201",
      amount: "5",
    })
  })

  test("a request typed for another method is replaced by a blank one", () => {
    render(buttons(boleto), {
      params: {
        button: [{ payment_request: { method: "pix", code: "000201" } }],
      },
    })

    expect(slot()?.payment_request).toEqual({
      method: "boleto",
      digitableLine: "",
    })
  })

  test("re-rendering with the same template does not wipe input", () => {
    render(buttons(pix), {})
    act(() => form.setValue("params.button.0.payment_request.code", "typed"))

    rerender(buttons(pix))

    expect(form.getValues("params.button.0.payment_request.code")).toBe("typed")
  })

  test("a payment button of unknown method shows a warning and no field", () => {
    render(buttons({ type: "PAYMENT_REQUEST", text: "Pay now" }), {})

    expect(container.textContent).toContain(
      "whatsapp.messageTemplate.params.payment.unsupportedButton",
    )
    expect(container.querySelectorAll("[data-testid=editor]")).toHaveLength(0)
    expect(slot()).toBeUndefined()
  })

  test("a template without payment buttons shows no warning", () => {
    render(buttons({ type: "QUICK_REPLY", text: "Later" }), {})

    expect(container.textContent).not.toContain("unsupportedButton")
  })
})
