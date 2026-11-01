import {
  type AISegmentImageSchema,
  aiSegmentImageDefaultFn,
  aiSegmentImageSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, useForm, useFormContext } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))

// React Flow handles need a flow store; only the rendered labels and ids matter.
vi.mock("@xyflow/react", () => ({
  Handle: ({ id }: { id: string }) => <span data-handle-id={id} />,
  Position: { Right: "right" },
  useNodeConnections: () => [],
}))

// The real select loads the workspace's custom fields over the network.
vi.mock("@/features/custom-fields/custom-field-select", () => ({
  CustomFieldSelect: ({ label, name }: { label: string; name: string }) => {
    const { formState, register } = useFormContext()
    const error = formState.errors[name]
    return (
      <label>
        {label}
        <input data-field={name} {...register(name)} />
        {error && <span data-error={name}>{String(error.message)}</span>}
      </label>
    )
  },
}))

vi.mock("@/components/tiptap/tiptap-editor-field", () => ({
  TiptapEditorField: () => null,
}))

// jsdom ships no ResizeObserver; Base UI dialogs and radios measure through it.
Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  ResizeObserver: class {
    disconnect = vi.fn()
    observe = vi.fn()
    unobserve = vi.fn()
  },
})

const { AISegmentImageViewer } = await import(
  "@/features/flows/react-flow/steps/ai-segment-image/viewer"
)
const { AISegmentImageDialog } = await import(
  "@/features/flows/react-flow/steps/ai-segment-image/components/segment-image-dialog"
)
const { aiSegmentImageStep } = await import(
  "@/features/flows/react-flow/steps/ai-segment-image/index"
)
const { AISegmentImageEditor } = await import(
  "@/features/flows/react-flow/steps/ai-segment-image/editor"
)
const { performActionMenus } = await import(
  "@/features/flows/react-flow/nodes/perform-action/menu"
)

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ""
})

const step = (): AISegmentImageSchema =>
  aiSegmentImageDefaultFn({
    id: "100",
    inputFieldId: "1",
    target: "product box",
    outputFieldId: "2",
  })

function ParentForm({
  children,
  initial,
  onReady,
}: {
  children: ReactNode
  initial: AISegmentImageSchema
  onReady: (getStep: () => AISegmentImageSchema) => void
}) {
  const form = useForm<{ step: AISegmentImageSchema }>({
    defaultValues: { step: initial },
  })
  onReady(() => form.getValues("step"))
  return <FormProvider {...form}>{children}</FormProvider>
}

async function renderDialog(initial: AISegmentImageSchema) {
  let getStep: () => AISegmentImageSchema = () => initial
  await act(() => {
    root.render(
      <ParentForm
        initial={initial}
        onReady={(getter) => {
          getStep = getter
        }}
      >
        <AISegmentImageDialog parentName="step" />
      </ParentForm>,
    )
  })
  const trigger = container.querySelector("button")
  await act(() => {
    trigger?.click()
  })
  return { getStep: () => getStep() }
}

const field = (name: string) =>
  document.querySelector<HTMLInputElement>(
    `[data-field="${name}"], input[name="${name}"]`,
  )

async function typeInto(name: string, value: string) {
  const input = field(name)
  if (!input) {
    throw new Error(`No input for ${name}`)
  }
  await act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

async function submit() {
  const form = document.querySelector("form")
  await act(() => {
    form?.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    )
  })
}

describe("aiSegmentImage builder step", () => {
  test("registers the shared schema and defaults", () => {
    expect(aiSegmentImageStep.validator).toBe(aiSegmentImageSchema)
    expect(
      aiSegmentImageStep.defaultFn().states.map((s) => s.stateType),
    ).toEqual(["success", "skip", "error"])
  })

  test("is offered under Muse AI actions without a provider prop", () => {
    const t = ((key: string) => key) as Parameters<typeof performActionMenus>[0]
    const muse = performActionMenus(t).find((menu) => menu.label === "Muse")
    const entry = muse?.children?.find(
      (item) => item.stepType === stepTypes.enum.aiSegmentImage,
    )

    expect(entry).toBeDefined()
    expect(entry?.props).toBeUndefined()
  })

  test("viewer renders Found / Not found / Failed handles and the summary", async () => {
    const data = step()
    await act(() => {
      root.render(<AISegmentImageViewer data={data} />)
    })

    const text = container.textContent ?? ""
    expect(text).toContain("fields.aiSegmentImage.states.success")
    expect(text).toContain("fields.aiSegmentImage.states.skip")
    expect(text).toContain("fields.aiSegmentImage.states.error")
    expect(text).toContain("product box")
    expect(text).toContain(
      "fields.aiSegmentImage.matchSelection.options.largest",
    )
    const handleIds = Array.from(
      container.querySelectorAll("[data-handle-id]"),
    ).map((handle) => handle.getAttribute("data-handle-id"))
    expect(handleIds).toEqual(data.states.map((state) => state.id))
  })

  test("submits valid values back to the flow form", async () => {
    const { getStep } = await renderDialog(step())

    await typeInto("detailsOutputFieldId", "3")
    await submit()

    expect(getStep()).toMatchObject({
      detailsOutputFieldId: "3",
      inputFieldId: "1",
      outputFieldId: "2",
      target: "product box",
    })
  })

  test("stores an empty details field as absent", async () => {
    const { getStep } = await renderDialog(step())

    await typeInto("detailsOutputFieldId", "")
    await submit()

    expect(getStep().detailsOutputFieldId).toBeUndefined()
  })

  test.each([
    ["2", "fields.aiSegmentImage.detailsOutputFieldId.sameAsOutput"],
    ["1", "fields.aiSegmentImage.detailsOutputFieldId.sameAsInput"],
  ])("shows a field error when details reuse field %s", async (fieldId, message) => {
    const { getStep } = await renderDialog(step())

    await typeInto("detailsOutputFieldId", fieldId)
    await submit()

    expect(
      document.querySelector('[data-error="detailsOutputFieldId"]')
        ?.textContent,
    ).toBe(message)
    expect(getStep().detailsOutputFieldId).toBeUndefined()
  })

  test("warns, without blocking, when the output replaces the source image", async () => {
    const { getStep } = await renderDialog(step())

    expect(document.body.textContent).not.toContain(
      "fields.aiSegmentImage.overwriteWarning",
    )
    await typeInto("outputFieldId", "1")
    expect(document.body.textContent).toContain(
      "fields.aiSegmentImage.overwriteWarning",
    )

    await submit()
    expect(getStep().outputFieldId).toBe("1")
  })

  test("editor shows the Muse title and an edit trigger", async () => {
    await act(() => {
      root.render(
        <ParentForm initial={step()} onReady={() => undefined}>
          <AISegmentImageEditor parentName="step" />
        </ParentForm>,
      )
    })

    expect(container.textContent).toContain("fields.flows.aiSegmentImage")
    expect(container.textContent).toContain("actions.edit")
  })

  test("is offered only under Muse, not other AI providers", () => {
    const t = ((key: string) => key) as Parameters<typeof performActionMenus>[0]
    const providers = performActionMenus(t)
      .filter((menu) =>
        menu.children?.some(
          (item) => item.stepType === stepTypes.enum.aiSegmentImage,
        ),
      )
      .map((menu) => menu.label)

    expect(providers).toEqual(["Muse"])
  })

  test("viewer hides the summary until a target is set", async () => {
    await act(() => {
      root.render(<AISegmentImageViewer data={aiSegmentImageDefaultFn()} />)
    })

    expect(container.textContent).not.toContain(
      "fields.aiSegmentImage.target.label",
    )
    expect(container.querySelectorAll("[data-handle-id]")).toHaveLength(3)
  })

  test("viewer labels the all-matches setting", async () => {
    await act(() => {
      root.render(
        <AISegmentImageViewer data={{ ...step(), matchSelection: "all" }} />,
      )
    })

    expect(container.textContent).toContain(
      "fields.aiSegmentImage.matchSelection.options.all",
    )
  })

  test("an empty target blocks submit and keeps the flow value", async () => {
    const { getStep } = await renderDialog(step())

    await typeInto("target", "   ")
    await submit()

    expect(getStep().target).toBe("product box")
    // `useRequestResolver` puts the translated "required" sentence on the field.
    expect(
      document.querySelector('[data-slot="form-message"]')?.textContent,
    ).toBe("required")
  })

  test("cancel leaves the flow value untouched", async () => {
    const { getStep } = await renderDialog(step())

    await typeInto("target", "red car")
    const cancel = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === "actions.cancel",
    )
    await act(() => {
      cancel?.click()
    })

    expect(getStep().target).toBe("product box")
  })

  test("reopening the dialog discards unsaved edits", async () => {
    await renderDialog(step())
    await typeInto("target", "red car")
    const cancel = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === "actions.cancel",
    )
    await act(() => {
      cancel?.click()
    })

    const trigger = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "actions.edit",
    )
    await act(() => {
      trigger?.click()
    })

    expect(field("target")?.value).toBe("product box")
  })

  test("submits the chosen match option", async () => {
    const { getStep } = await renderDialog(step())

    const radio = document.getElementById("matchSelectionall")
    await act(() => {
      radio?.click()
    })
    await submit()

    expect(getStep()).toMatchObject({ matchSelection: "all" })
  })

  test("keeps the step's states and id when saving", async () => {
    const initial = step()
    const { getStep } = await renderDialog(initial)

    await typeInto("target", "red car")
    await submit()

    expect(getStep().id).toBe(initial.id)
    expect(getStep().states).toEqual(initial.states)
    expect(getStep().target).toBe("red car")
  })
})
