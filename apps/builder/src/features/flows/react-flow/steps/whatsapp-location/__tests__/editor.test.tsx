// @vitest-environment jsdom
import { whatsappLocationStepDefaultFn } from "@chatbotx.io/flow-config"
import { act, type ComponentProps, type ReactElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, type UseFormReturn, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import WhatsappLocationStepEditor from "../editor"

vi.mock("@/components/tiptap/tiptap-editor-field", () => ({
  TiptapEditorField: (props: { name: string }) => (
    <div data-testid={`tiptap-${props.name}`} />
  ),
}))

vi.mock("@chatbotx.io/ui/components/ui/button", () => ({
  Button: ({ children, ...props }: ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
}))

// Render the dialog inline (no portal / animation) so jsdom can query it;
// DialogClose closes it through the same onOpenChange the real one calls.
vi.mock("@chatbotx.io/ui/components/ui/dialog", async () => {
  const { cloneElement, createContext, useContext } = await import("react")
  const CloseContext = createContext<() => void>(() => undefined)
  type Children = { children: ReactElement }

  return {
    Dialog: ({
      children,
      open,
      onOpenChange,
    }: Children & { open: boolean; onOpenChange: (open: boolean) => void }) =>
      open ? (
        <CloseContext.Provider value={() => onOpenChange(false)}>
          <div data-testid="dialog">{children}</div>
        </CloseContext.Provider>
      ) : null,
    DialogContent: ({ children }: Children) => children,
    DialogHeader: ({ children }: Children) => children,
    DialogTitle: ({ children }: Children) => children,
    DialogDescription: () => null,
    DialogFooter: ({ children }: Children) => children,
    DialogClose: ({ render }: { render: ReactElement }) => {
      const close = useContext(CloseContext)
      return cloneElement(render as ReactElement<ComponentProps<"button">>, {
        onClick: close,
      })
    },
  }
})

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

let container: HTMLDivElement
let root: Root
let formApi: UseFormReturn | undefined

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
  formApi = undefined
})

const Harness = ({ step }: { step: Record<string, unknown> }) => {
  const form = useForm({ defaultValues: { steps: [step] } })
  formApi = form as unknown as UseFormReturn

  return (
    <FormProvider {...form}>
      <WhatsappLocationStepEditor parentName="steps.0" />
    </FormProvider>
  )
}

const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

const renderEditor = async (step: Record<string, unknown>) => {
  act(() => {
    root.render(<Harness step={step} />)
  })
  await flush()
}

const openDialog = async () => {
  const trigger = container.querySelector<HTMLButtonElement>(
    'button[aria-label="flows.whatsappLocation.setLocation"]',
  )
  act(() => trigger?.click())
  await flush()
}

const input = (name: string) =>
  container.querySelector<HTMLInputElement>(`input[name="${name}"]`)

const typeInto = async (name: string, value: string) => {
  const element = input(name)
  if (!element) {
    throw new Error(`input ${name} not found`)
  }
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set
  act(() => {
    setValue?.call(element, value)
    element.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await flush()
}

const buttonByText = (text: string) =>
  Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === text,
  )

describe("WhatsappLocationStepEditor", () => {
  test("shows an unconfigured step as 'set location' without coordinates", async () => {
    await renderEditor(whatsappLocationStepDefaultFn())

    expect(container.textContent).toContain(
      "flows.whatsappLocation.setLocation",
    )
    expect(container.textContent).not.toContain("0.00000")
  })

  test("opens an unconfigured step with empty coordinates and Continue disabled", async () => {
    await renderEditor(whatsappLocationStepDefaultFn())
    await openDialog()

    expect(input("latitude")?.value).toBe("")
    expect(input("longitude")?.value).toBe("")
    expect(buttonByText("actions.continue")?.disabled).toBe(true)
  })

  test("shows a translated error for an out-of-range latitude", async () => {
    await renderEditor(whatsappLocationStepDefaultFn())
    await openDialog()
    await typeInto("latitude", "91")

    expect(container.textContent).toContain(
      "flows.whatsappLocation.errors.invalidLatitude",
    )
  })

  test("saves the coordinates as numbers on Continue", async () => {
    await renderEditor(whatsappLocationStepDefaultFn())
    await openDialog()
    await typeInto("latitude", "15,5614")
    await typeInto("longitude", "108.4867")

    const form = buttonByText("actions.continue")?.closest("form")
    act(() => {
      form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      )
    })
    await flush()

    expect(formApi?.getValues("steps.0.latitude")).toBe(15.5614)
    expect(formApi?.getValues("steps.0.longitude")).toBe(108.4867)
    expect(container.querySelector('[data-testid="dialog"]')).toBeNull()
  })

  test("discards unsaved edits on Cancel", async () => {
    await renderEditor(
      whatsappLocationStepDefaultFn({ latitude: 10, longitude: 20 }),
    )
    await openDialog()
    await typeInto("latitude", "45")
    act(() => buttonByText("actions.cancel")?.click())
    await flush()
    await openDialog()

    expect(input("latitude")?.value).toBe("10")
    expect(formApi?.getValues("steps.0.latitude")).toBe(10)
  })

  test("opens a tiny coordinate as plain decimal text", async () => {
    await renderEditor(
      whatsappLocationStepDefaultFn({ latitude: 1e-7, longitude: 20 }),
    )
    await openDialog()

    expect(input("latitude")?.value).toBe("0.0000001")
    expect(buttonByText("actions.continue")?.disabled).toBe(false)
  })
})
