// @vitest-environment jsdom
import {
  type TriggerEventType,
  triggerEventTypes,
} from "@chatbotx.io/database/partials"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ConditionEditor } from "../editor"

vi.mock("@chatbotx.io/ui/components/form/input-field", () => ({
  InputField: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}))

vi.mock("@chatbotx.io/ui/components/form/select-field", async () => {
  const { useFormContext } = await import("react-hook-form")

  return {
    SelectField: ({
      name,
      options,
    }: {
      name: string
      options: { label: string; value: string }[]
    }) => {
      const form = useFormContext()

      return (
        <select
          data-testid="condition-source"
          {...form.register(name)}
          name={name}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )
    },
  }
})

vi.mock("@/features/sequences/provider/sequence-hook", () => ({
  useSequenceOptions: () => [
    { id: "sequence-1", name: "Welcome" },
    { id: "sequence-2", name: "Retention" },
  ],
}))

vi.mock("@/features/tags/provider/tag-hook", () => ({
  useTagSelectOptions: () => [],
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("../custom-field-value-changed", () => ({
  CustomFieldValueChanged: () => null,
}))

vi.mock("../date-time-based-trigger", () => ({
  DateTimeBasedTrigger: () => null,
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
})

const render = (ui: React.ReactElement) => {
  act(() => {
    root.render(ui)
  })
}

function TestConditionEditor({
  defaultSourceId = "sequence-2",
  type = triggerEventTypes.enum.subscribedToSequence,
  onSubmit,
}: {
  defaultSourceId?: string
  type?: TriggerEventType
  onSubmit?: (values: { conditions: { sourceId: string }[] }) => void
}) {
  const form = useForm({
    defaultValues: {
      conditions: [{ sourceId: defaultSourceId }],
    },
  })

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit((values) => onSubmit?.(values))}>
        <ConditionEditor parentName="conditions.0" type={type} />
        <button type="submit">Save</button>
      </form>
    </FormProvider>
  )
}

describe("ConditionEditor", () => {
  test("saves and reloads sequence source id for sequence subscription conditions", async () => {
    const onSubmit = vi.fn()
    render(<TestConditionEditor onSubmit={onSubmit} />)

    const select = container.querySelector(
      'select[name="conditions.0.sourceId"]',
    )
    expect(select).toBeInstanceOf(HTMLSelectElement)
    expect(
      Array.from(select?.querySelectorAll("option") ?? []).map((option) => ({
        label: option.textContent,
        value: option.getAttribute("value"),
      })),
    ).toEqual([
      { label: "Welcome", value: "sequence-1" },
      { label: "Retention", value: "sequence-2" },
    ])
    expect((select as HTMLSelectElement).value).toBe("sequence-2")

    act(() => {
      ;(select as HTMLSelectElement).value = "sequence-1"
      select?.dispatchEvent(new Event("change", { bubbles: true }))
    })
    act(() => {
      container
        .querySelector("form")
        ?.dispatchEvent(
          new SubmitEvent("submit", { bubbles: true, cancelable: true }),
        )
    })

    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        conditions: [{ sourceId: "sequence-1" }],
      })
    })

    render(<TestConditionEditor defaultSourceId="sequence-1" />)
    expect(
      (
        container.querySelector(
          'select[name="conditions.0.sourceId"]',
        ) as HTMLSelectElement
      ).value,
    ).toBe("sequence-1")
  })

  test("offers phone and email source options for contact info updated conditions", () => {
    render(
      <TestConditionEditor
        defaultSourceId="phone"
        type={triggerEventTypes.enum.contactInfoUpdated}
      />,
    )

    const select = container.querySelector(
      'select[name="conditions.0.sourceId"]',
    )
    expect(select).toBeInstanceOf(HTMLSelectElement)
    expect(
      Array.from(select?.querySelectorAll("option") ?? []).map((option) => ({
        label: option.textContent,
        value: option.getAttribute("value"),
      })),
    ).toEqual([
      { label: "fields.phone.label", value: "phone" },
      { label: "fields.email.label", value: "email" },
    ])
    expect((select as HTMLSelectElement).value).toBe("phone")
  })
})
