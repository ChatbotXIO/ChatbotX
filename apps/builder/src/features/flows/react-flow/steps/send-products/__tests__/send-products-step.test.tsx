// @vitest-environment jsdom
import {
  type SendProductsStepSchema,
  sendProductsStepDefaultFn,
} from "@chatbotx.io/flow-config"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, type UseFormReturn, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import SendProductsStepEditor from "../editor"
import type { SendProductsFormValues } from "../lib/form"
import SendProductsStepViewer from "../viewer"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${params.count}` : key,
}))

// The dialog has its own tests; here it only hands back the values it would save.
const dialogProps = vi.hoisted(() => ({
  last: undefined as
    | {
        open: boolean
        channel: string
        onSave: (values: SendProductsFormValues) => void
      }
    | undefined,
}))
vi.mock("../components/send-products-dialog", () => ({
  SendProductsDialog: (props: {
    open: boolean
    channel: string
    onSave: (values: SendProductsFormValues) => void
  }) => {
    dialogProps.last = props
    return <div data-open={String(props.open)} data-testid="dialog" />
  },
}))

let container: HTMLDivElement
let root: Root
let form: UseFormReturn<{
  beforeStep: { channel: string }
  step: SendProductsStepSchema
}>

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  dialogProps.last = undefined
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const Harness = ({
  step,
  channel,
}: {
  step: SendProductsStepSchema
  channel: string
}) => {
  form = useForm({ defaultValues: { beforeStep: { channel }, step } })
  return (
    <FormProvider {...form}>
      <SendProductsStepEditor parentName="step" />
    </FormProvider>
  )
}

const renderEditor = (
  step: Partial<SendProductsStepSchema> = {},
  channel = "whatsapp",
) =>
  act(() =>
    root.render(
      <Harness channel={channel} step={sendProductsStepDefaultFn(step)} />,
    ),
  )

describe("SendProductsStepEditor", () => {
  test("summarises the step and opens the dialog on click", () => {
    renderEditor({ sections: [{ productIds: ["1", "2"] }] })

    expect(container.textContent).toContain("flows.actions.sendProducts")
    expect(container.textContent).toContain(
      "flows.sendProducts.productsSelected:2",
    )
    expect(
      container
        .querySelector('[data-testid="dialog"]')
        ?.getAttribute("data-open"),
    ).toBe("false")

    act(() => {
      container.querySelector<HTMLButtonElement>("button")?.click()
    })

    expect(
      container
        .querySelector('[data-testid="dialog"]')
        ?.getAttribute("data-open"),
    ).toBe("true")
  })

  test("says so when no product is chosen yet", () => {
    renderEditor()

    expect(container.textContent).toContain("flows.sendProducts.noneSelected")
  })

  test("hands the dialog the node's channel", () => {
    renderEditor({}, "whatsapp")

    expect(dialogProps.last?.channel).toBe("whatsapp")
  })

  test("renders no dialog when the node has no usable channel", () => {
    renderEditor({}, "")

    expect(container.querySelector('[data-testid="dialog"]')).toBeNull()
  })

  test("saving writes the dialog's values into the step and keeps its identity", () => {
    renderEditor({ sections: [{ productIds: ["1"] }] })
    const before = form.getValues("step")

    act(() => {
      dialogProps.last?.onSave({
        display: "carousel",
        header: "",
        body: " Look ",
        footer: "",
        sections: [{ title: "", productIds: ["1", "2"] }],
        thumbnailProductId: undefined,
      })
    })

    expect(form.getValues("step")).toMatchObject({
      id: before.id,
      stepType: "sendProducts",
      display: "carousel",
      body: "Look",
      sections: [{ productIds: ["1", "2"] }],
    })
  })
})

describe("SendProductsStepViewer", () => {
  const renderViewer = (step: Partial<SendProductsStepSchema>) =>
    act(() =>
      root.render(
        <SendProductsStepViewer data={sendProductsStepDefaultFn(step)} />,
      ),
    )

  test("shows the display and product count", () => {
    renderViewer({
      display: "carousel",
      sections: [{ productIds: ["1", "2", "3"] }],
    })

    expect(container.textContent).toContain(
      "flows.sendProducts.displays.carousel",
    )
    expect(container.textContent).toContain(
      "flows.sendProducts.productsSelected:3",
    )
  })

  test("a catalog shows just its display, with no product count", () => {
    renderViewer({ display: "catalog", sections: [] })

    expect(container.textContent).toContain(
      "flows.sendProducts.displays.catalog",
    )
    expect(container.textContent).not.toContain("productsSelected")
    expect(container.textContent).not.toContain("noneSelected")
  })
})
