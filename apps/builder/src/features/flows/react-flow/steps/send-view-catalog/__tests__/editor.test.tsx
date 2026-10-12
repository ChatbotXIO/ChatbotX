// @vitest-environment jsdom
import { resolveSendViewCatalogLengthLimits } from "@chatbotx.io/flow-config"
import { act, type ReactElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, type UseFormReturn, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import SendViewCatalogStepEditor from "../editor"

type TiptapProps = {
  hideMessage?: boolean
  label?: string
  maxLength?: number
  name: string
  required?: boolean
}

const tiptapEditorFieldMock = vi.fn()

vi.mock("@/components/tiptap/tiptap-editor-field", () => ({
  TiptapEditorField: (props: TiptapProps) => {
    tiptapEditorFieldMock(props)
    return <div data-testid={`tiptap-${props.name}`} />
  },
}))

vi.mock(
  "@/features/integration-whatsapp/message-templates/components/meta-catalog-product-select",
  () => ({
    MetaCatalogProductSelect: (props: {
      value?: string
      onChange: (
        option:
          | { retailerId: string; name: string; imageUrl: null }
          | undefined,
      ) => void
    }) => (
      <div data-testid="product-select" data-value={props.value ?? ""}>
        <button
          data-testid="pick"
          onClick={() =>
            props.onChange({
              retailerId: "sku-9",
              name: "Shoe",
              imageUrl: null,
            })
          }
          type="button"
        />
        <button
          data-testid="clear"
          onClick={() => props.onChange(undefined)}
          type="button"
        />
      </div>
    ),
  }),
)

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

/** The key of the message shown for a validation code (the `t` mock echoes keys). */
const RAW_BODY_CODE = /(^|[^.])sendViewCatalogBodyTooLong/

let container: HTMLDivElement
let root: Root
let formApi: UseFormReturn | undefined

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  tiptapEditorFieldMock.mockReset()
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const render = (element: ReactElement) => {
  act(() => {
    root.render(element)
  })
}

/** Mirrors the node-details form the step editor lives inside. */
const Harness = ({
  channel,
  footer = "",
  thumbnailProductId = "",
}: {
  channel: string
  footer?: string
  thumbnailProductId?: string
}) => {
  const form = useForm({
    defaultValues: {
      beforeStep: { channel },
      steps: [{ text: "", footer, thumbnailProductId }],
    },
  })
  formApi = form as unknown as UseFormReturn

  return (
    <FormProvider {...form}>
      <SendViewCatalogStepEditor parentName="steps.0" />
    </FormProvider>
  )
}

const propsFor = (name: string) =>
  tiptapEditorFieldMock.mock.calls
    .map((call) => call[0] as TiptapProps)
    .findLast((props) => props.name === name)

const byTestId = (id: string) =>
  document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)

const catalogButton = () =>
  Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("flows.actions.sendViewCatalog"),
  )

/** Async so the dialog form's validation and submit settle before assertions. */
const click = async (element: Element | null | undefined) => {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await Promise.resolve()
  })
}

const openDialog = () => click(catalogButton())

const dialogButton = (label: string) =>
  Array.from(document.body.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === label,
  )

describe("send view catalog editor — the card", () => {
  test("shows the body as rich text and the catalog button, nothing else to fill in", () => {
    render(<Harness channel="whatsapp" />)

    expect(byTestId("tiptap-steps.0.text")).not.toBeNull()
    expect(catalogButton()).toBeDefined()
    expect(byTestId("tiptap-steps.0.footer")).toBeNull()
    expect(byTestId("product-select")).toBeNull()
  })

  test("gives the body a multi-line, textarea-like box rather than a single line", () => {
    render(<Harness channel="whatsapp" />)

    expect(byTestId("tiptap-steps.0.text")?.parentElement?.className).toContain(
      "[&_.tiptap]:min-h-14",
    )
  })

  test("budgets the body by the node's channel", () => {
    render(<Harness channel="whatsapp" />)

    expect(propsFor("steps.0.text")?.maxLength).toBe(1024)
  })

  test("falls back to the widest budget on an omnichannel node", () => {
    render(<Harness channel="omnichannel" />)

    expect(propsFor("steps.0.text")?.maxLength).toBe(
      resolveSendViewCatalogLengthLimits("omnichannel").text,
    )
  })

  test("previews the saved footer on the card, and nothing when there is none", () => {
    render(<Harness channel="whatsapp" key="empty" />)
    expect(container.textContent).not.toContain("Free shipping")

    render(<Harness channel="whatsapp" footer="Free shipping" key="saved" />)
    expect(container.textContent).toContain("Free shipping")
  })

  test("keeps the footer line clear of the editor's floating toolbar", () => {
    render(<Harness channel="whatsapp" footer="Free shipping" />)
    const footerLine = Array.from(container.querySelectorAll("p")).find((p) =>
      p.textContent?.includes("Free shipping"),
    )

    // The toolbar (emoji, variables, counter) hangs just below the editor
    // while it is focused and would cover anything right under it, so room is
    // made then, and only then.
    const className = footerLine?.parentElement?.className ?? ""
    expect(className).toContain("group-focus-within/body:pt-8")
    expect(className.split(" ")).not.toContain("pt-8")
  })

  test("adds no gap when there is no footer and no error to show", () => {
    render(<Harness channel="whatsapp" />)

    const stack = container.querySelector(".group\\/body > div:last-child")

    expect(stack?.className ?? "").toContain("empty:hidden")
    expect(stack?.childElementCount).toBe(0)
  })

  test("shows a length rule's translated message under the body instead of the raw code", () => {
    render(<Harness channel="whatsapp" />)

    act(() => {
      formApi?.setError("steps.0.text", {
        type: "custom",
        message: "sendViewCatalogBodyTooLong",
      })
    })

    expect(propsFor("steps.0.text")?.hideMessage).toBe(true)
    expect(container.textContent).toContain(
      "messages.sendViewCatalogBodyTooLong",
    )
    expect(container.textContent).not.toMatch(RAW_BODY_CODE)
  })

  test("keeps a plain schema message as it is", () => {
    render(<Harness channel="whatsapp" />)

    act(() => {
      formApi?.setError("steps.0.text", {
        type: "custom",
        message: "Something specific",
      })
    })

    expect(container.textContent).toContain("Something specific")
  })
})

describe("send view catalog editor — the button's dialog", () => {
  test("opens from the button with the footer and the thumbnail product", async () => {
    render(<Harness channel="whatsapp" />)
    await openDialog()

    expect(byTestId("tiptap-footer")).not.toBeNull()
    expect(byTestId("product-select")).not.toBeNull()
  })

  test("the footer is optional and budgeted by the node's channel", async () => {
    render(<Harness channel="whatsapp" />)
    await openDialog()

    expect(propsFor("footer")?.required).toBe(false)
    expect(propsFor("footer")?.label).toBe("flows.sendViewCatalog.footerLabel")
    expect(propsFor("footer")?.maxLength).toBe(60)
  })

  test("starts from the saved thumbnail product", async () => {
    render(<Harness channel="whatsapp" thumbnailProductId="sku-1" />)
    await openDialog()

    expect(byTestId("product-select")?.getAttribute("data-value")).toBe("sku-1")
  })

  test("saving writes the picked product to the step and marks the form dirty", async () => {
    render(<Harness channel="whatsapp" />)
    await openDialog()

    await click(byTestId("pick"))
    await click(dialogButton("actions.save"))

    expect(formApi?.getValues("steps.0.thumbnailProductId")).toBe("sku-9")
    expect(formApi?.getFieldState("steps.0.thumbnailProductId").isDirty).toBe(
      true,
    )
  })

  test("clearing the product saves an empty string, never undefined", async () => {
    render(<Harness channel="whatsapp" thumbnailProductId="sku-1" />)
    await openDialog()

    await click(byTestId("clear"))
    await click(dialogButton("actions.save"))

    expect(formApi?.getValues("steps.0.thumbnailProductId")).toBe("")
  })

  test("reopening after a cancel starts again from the step, not from the discarded edit", async () => {
    render(<Harness channel="whatsapp" thumbnailProductId="sku-1" />)
    await openDialog()
    await click(byTestId("pick"))
    await click(dialogButton("actions.cancel"))

    await openDialog()

    expect(byTestId("product-select")?.getAttribute("data-value")).toBe("sku-1")
    await click(dialogButton("actions.save"))
    expect(formApi?.getValues("steps.0.thumbnailProductId")).toBe("sku-1")
  })

  test("cancelling leaves the step untouched", async () => {
    render(<Harness channel="whatsapp" thumbnailProductId="sku-1" />)
    await openDialog()

    await click(byTestId("pick"))
    await click(dialogButton("actions.cancel"))

    expect(formApi?.getValues("steps.0.thumbnailProductId")).toBe("sku-1")
  })
})
