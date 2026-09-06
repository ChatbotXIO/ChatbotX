// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  type FieldValues,
  FormProvider,
  type UseFormReturn,
  useForm,
} from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ContentEditor } from "@/features/facebook-marketing-messages/components/content/content-editor"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

/**
 * The real `SelectField` renders its options into a portal that only mounts on
 * open, so it cannot be driven from jsdom. This stub keeps the part under test
 * — the `triggerValueChange` contract — and exposes one button per option.
 */
vi.mock("@chatbotx.io/ui/components/form/select-field", () => ({
  SelectField: ({
    name,
    options,
    triggerValueChange,
  }: {
    name: string
    options: { value: string; label: string }[]
    triggerValueChange?: (value: string) => void
  }) => (
    <div>
      {options.map((option) => (
        <button
          data-testid={`${name}:${option.value}`}
          key={option.value}
          onClick={() => triggerValueChange?.(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  ),
}))

// The template-specific blocks all unmount on a switch, so they are irrelevant
// here — only the always-mounted quick-reply list matters.
vi.mock(
  "@/features/facebook-marketing-messages/components/content/media-field",
  () => ({ MediaField: () => null }),
)
vi.mock(
  "@/features/facebook-marketing-messages/components/content/generic-elements-field",
  () => ({ GenericElementsField: () => null }),
)
vi.mock(
  "@/features/facebook-marketing-messages/components/content/button-list-field",
  () => ({ ButtonListField: () => null }),
)

// The quick reply's action editor reads the flow store, which this test does
// not exercise.
vi.mock("@/features/flows/provider/flow-hook", () => ({
  useFlowSelectOptions: () => [{ value: "10", label: "Flow A" }],
  getFlowNodesOptions: () => [{ value: "20", label: "Node A" }],
}))
vi.mock("@/features/flows/provider/flow-store-context", () => ({
  useFlowStore: () => [{ id: "10", flowVersions: [] }],
}))

const quickReply = (id: string, title: string) => ({
  id,
  contentType: "text" as const,
  title,
  action: { actionType: "startExternalFlow" as const, flowId: "10" },
})

let form: UseFormReturn<FieldValues>

function Harness() {
  form = useForm({
    defaultValues: {
      content: {
        templateType: "text",
        text: "Hi",
        quickReplies: [quickReply("201", "Yes"), quickReply("202", "No")],
      },
    },
  }) as unknown as UseFormReturn<FieldValues>

  return (
    <FormProvider {...form}>
      <ContentEditor />
    </FormProvider>
  )
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

/** With the template-specific blocks stubbed out, every row is a quick reply. */
const quickReplyCount = () =>
  container.querySelectorAll('[data-testid="mm-item-row"]').length

const switchTemplateTo = (templateType: string) => {
  const button = container.querySelector<HTMLButtonElement>(
    `[data-testid="content.templateType:${templateType}"]`,
  )
  act(() => button?.click())
}

describe("ContentEditor — switching template", () => {
  test("clears the quick replies that every template shares", () => {
    act(() => root.render(<Harness />))
    expect(quickReplyCount()).toBe(2)

    switchTemplateTo("media")

    // The form value and the rendered list must agree. `setValue` on the parent
    // `content` object alone empties the value but leaves the mounted
    // `useFieldArray` rendering its stale rows.
    expect(form.getValues("content.quickReplies")).toEqual([])
    expect(quickReplyCount()).toBe(0)
  })

  test("resets the previous template's own fields", () => {
    act(() => root.render(<Harness />))

    switchTemplateTo("generic")

    expect(form.getValues("content")).toEqual({
      templateType: "generic",
      greeting: "",
      elements: [expect.objectContaining({ title: "", buttons: [] })],
      quickReplies: [],
    })
  })
})
