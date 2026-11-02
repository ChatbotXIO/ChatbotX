// @vitest-environment jsdom

import { FieldOperationType } from "@chatbotx.io/flow-config"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { SetCustomField } from "@/features/contacts/components/add-custom-field-dialog"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "workspace-1",
}))

vi.mock("@/features/custom-fields/provider/custom-field-hook", () => ({
  useCustomFields: () => ({
    data: [
      { id: "field-bool", name: "Flag", type: "boolean" },
      { id: "field-number", name: "Score", type: "number" },
    ],
  }),
  useBotFields: () => ({ data: [] }),
}))

vi.mock("@/features/custom-fields/custom-field-select", () => ({
  CustomFieldSelect: () => null,
  CustomFieldOperationSelect: () => null,
}))

vi.mock("@/features/custom-fields/components/custom-field-value-input", () => ({
  CustomFieldValueInput: ({ type }: { type: string }) => (
    <div data-testid="typed-input" data-type={type} />
  ),
}))

// The real select is a Radix popover; a flat stand-in is enough to read the
// name, the options and the placeholder it is given.
vi.mock("@chatbotx.io/ui/components/form/select-field", () => ({
  SelectField: ({
    name,
    options,
    placeholder,
  }: {
    name: string
    options: Array<{ value: string; label: string }>
    placeholder?: string
  }) => (
    <div
      data-name={name}
      data-placeholder={placeholder}
      data-testid="boolean-select"
    >
      {options.map((option) => (
        <span data-value={option.value} key={option.value}>
          {option.label}
        </span>
      ))}
    </div>
  ),
}))

vi.mock(
  "../src/features/contacts/actions/add-contact-custom-field.action",
  () => ({
    addContactCustomFieldAction: vi.fn(),
  }),
)

vi.mock("@next-safe-action/adapter-react-hook-form/hooks", () => ({
  useHookFormAction: vi.fn(),
}))

vi.mock("@/features/contact-filter/lib/timezone", () => ({
  getBrowserTimezone: () => "UTC",
}))

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
  document.body.innerHTML = ""
})

const Harness = ({
  customFieldId,
  operation,
}: {
  customFieldId: string
  operation: FieldOperationType
}) => {
  const form = useForm({
    defaultValues: { customFieldId, operation, value: "" },
  })
  return (
    <FormProvider {...form}>
      <SetCustomField />
    </FormProvider>
  )
}

const render = (customFieldId: string, operation: FieldOperationType) => {
  act(() => {
    root.render(<Harness customFieldId={customFieldId} operation={operation} />)
  })
}

describe("SetCustomField boolean value", () => {
  test("a boolean is picked from True/False, not ticked", () => {
    render("field-bool", FieldOperationType.set)

    const select = container.querySelector('[data-testid="boolean-select"]')
    expect(select?.getAttribute("data-name")).toBe("value")
    expect(select?.getAttribute("data-placeholder")).toBe(
      "fields.boolean.placeholder",
    )
    expect(
      Array.from(select?.querySelectorAll("span") ?? []).map((option) => [
        option.getAttribute("data-value"),
        option.textContent,
      ]),
    ).toEqual([
      ["true", "fields.boolean.true"],
      ["false", "fields.boolean.false"],
    ])
    expect(container.querySelector('[data-testid="typed-input"]')).toBeNull()
  })

  test("other types keep the typed input", () => {
    render("field-number", FieldOperationType.set)

    expect(
      container
        .querySelector('[data-testid="typed-input"]')
        ?.getAttribute("data-type"),
    ).toBe("number")
    expect(container.querySelector('[data-testid="boolean-select"]')).toBeNull()
  })

  test("clearing a boolean needs no value control", () => {
    render("field-bool", FieldOperationType.clear)

    expect(container.querySelector('[data-testid="boolean-select"]')).toBeNull()
    expect(container.querySelector('[data-testid="typed-input"]')).toBeNull()
  })
})
