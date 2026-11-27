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

// Both field mocks render a native <select> tagged with the component name so
// tests can assert which field a condition type uses. Like the real pickers, a
// user's choice also reaches `triggerValueChange`.
const { createFieldMock } = vi.hoisted(() => ({
  createFieldMock: async (component: "select" | "combobox") => {
    const { useFormContext } = await import("react-hook-form")

    return ({
      name,
      options,
      triggerValueChange,
    }: {
      name: string
      options: { label: string; value: string }[]
      triggerValueChange?: (value: string) => void
    }) => {
      const form = useFormContext()
      const registered = form.register(name)

      return (
        <select
          data-component={component}
          {...registered}
          name={name}
          onChange={(event) => {
            // react-hook-form stores the value synchronously; validation is async.
            registered.onChange(event)
            triggerValueChange?.(event.target.value)
          }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )
    }
  },
}))

vi.mock("@chatbotx.io/ui/components/form/select-field", async () => ({
  SelectField: await createFieldMock("select"),
}))

vi.mock("@chatbotx.io/ui/components/form/combobox-field", async () => ({
  ComboboxField: await createFieldMock("combobox"),
}))

vi.mock("@/features/sequences/provider/sequence-hook", () => ({
  useSequenceOptions: () => [
    { id: "sequence-1", name: "Welcome" },
    { id: "sequence-2", name: "Retention" },
  ],
}))

vi.mock("@/features/tags/provider/tag-hook", () => ({
  useTagSelectOptions: () => [
    { label: "VIP", value: "tag-1" },
    { label: "Lead", value: "tag-2" },
  ],
}))

vi.mock("@/features/pipelines/lib/use-pipeline-options", () => ({
  usePipelineOptions: () => ({
    isLoading: false,
    pipelines: [
      {
        id: "11",
        name: "Sales",
        statusLabels: { open: "Open", won: "Won", lost: "Lost" },
        stages: [
          { id: "21", name: "Lead" },
          { id: "22", name: "Qualified" },
        ],
      },
      {
        id: "12",
        name: "Support",
        statusLabels: { open: "Open", won: "Won", lost: "Lost" },
        stages: [{ id: "31", name: "Inbox" }],
      },
    ],
  }),
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
    expect(select?.getAttribute("data-component")).toBe("combobox")
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

  test.each([
    triggerEventTypes.enum.tagApplied,
    triggerEventTypes.enum.tagRemoved,
  ])("uses a searchable combobox for %s tag conditions and saves the tag id", async (type) => {
    const onSubmit = vi.fn()
    render(
      <TestConditionEditor
        defaultSourceId="tag-2"
        onSubmit={onSubmit}
        type={type}
      />,
    )

    const select = container.querySelector(
      'select[name="conditions.0.sourceId"]',
    ) as HTMLSelectElement
    expect(select.getAttribute("data-component")).toBe("combobox")
    expect(
      Array.from(select.querySelectorAll("option")).map((option) => ({
        label: option.textContent,
        value: option.getAttribute("value"),
      })),
    ).toEqual([
      { label: "VIP", value: "tag-1" },
      { label: "Lead", value: "tag-2" },
    ])
    expect(select.value).toBe("tag-2")

    act(() => {
      select.value = "tag-1"
      select.dispatchEvent(new Event("change", { bubbles: true }))
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
        conditions: [{ sourceId: "tag-1" }],
      })
    })
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
    expect(select?.getAttribute("data-component")).toBe("select")
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

  const optionsOf = (name: string) =>
    Array.from(container.querySelectorAll(`select[name="${name}"] option`)).map(
      (option) => ({
        label: option.textContent,
        value: option.getAttribute("value"),
      }),
    )

  test.each([
    triggerEventTypes.enum.pipelineItemCreated,
    triggerEventTypes.enum.pipelineItemValueChanged,
    triggerEventTypes.enum.pipelineItemStatusChanged,
    triggerEventTypes.enum.pipelineItemPriorityChanged,
  ])("offers any pipeline plus every pipeline for %s and no stage picker", (type) => {
    render(<TestConditionEditor defaultSourceId="" type={type} />)

    expect(optionsOf("conditions.0.sourceId")).toEqual([
      { label: "trigger.conditions.anyPipeline", value: "" },
      { label: "Sales", value: "11" },
      { label: "Support", value: "12" },
    ])
    expect(
      container.querySelector('select[name="conditions.0.value.stageId"]'),
    ).toBeNull()
  })

  test("moved to stage lists every stage by pipeline until a pipeline is chosen, then only its stages", () => {
    render(
      <TestConditionEditor
        defaultSourceId=""
        type={triggerEventTypes.enum.pipelineItemMovedToStage}
      />,
    )

    expect(optionsOf("conditions.0.value.stageId")).toEqual([
      { label: "trigger.conditions.anyStage", value: "" },
      { label: "Sales › Lead", value: "21" },
      { label: "Sales › Qualified", value: "22" },
      { label: "Support › Inbox", value: "31" },
    ])

    const pipeline = container.querySelector(
      'select[name="conditions.0.sourceId"]',
    ) as HTMLSelectElement
    act(() => {
      pipeline.value = "11"
      pipeline.dispatchEvent(new Event("change", { bubbles: true }))
    })

    expect(optionsOf("conditions.0.value.stageId")).toEqual([
      { label: "trigger.conditions.anyStage", value: "" },
      { label: "Lead", value: "21" },
      { label: "Qualified", value: "22" },
    ])
  })

  test("moved to stage saves the destination stage and clears one from another pipeline", async () => {
    const onSubmit = vi.fn()
    render(
      <TestConditionEditor
        defaultSourceId=""
        onSubmit={onSubmit}
        type={triggerEventTypes.enum.pipelineItemMovedToStage}
      />,
    )
    const change = (name: string, value: string) => {
      const select = container.querySelector(
        `select[name="${name}"]`,
      ) as HTMLSelectElement
      act(() => {
        select.value = value
        select.dispatchEvent(new Event("change", { bubbles: true }))
      })
    }
    const submit = () =>
      act(() => {
        container
          .querySelector("form")
          ?.dispatchEvent(
            new SubmitEvent("submit", { bubbles: true, cancelable: true }),
          )
      })

    change("conditions.0.value.stageId", "31")
    submit()
    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenLastCalledWith({
        conditions: [{ sourceId: "", value: { stageId: "31" } }],
      })
    })

    // Picking another pipeline drops the stage that no longer belongs to it.
    change("conditions.0.sourceId", "11")
    submit()
    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenLastCalledWith({
        conditions: [{ sourceId: "11", value: { stageId: "" } }],
      })
    })
  })

  test("keeps a saved stage when its pipeline is not in the loaded options", async () => {
    const onSubmit = vi.fn()
    function Harness() {
      const form = useForm({
        defaultValues: {
          conditions: [{ sourceId: "999", value: { stageId: "777" } }],
        },
      })
      return (
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit((values) => onSubmit(values))}>
            <ConditionEditor
              parentName="conditions.0"
              type={triggerEventTypes.enum.pipelineItemMovedToStage}
            />
          </form>
        </FormProvider>
      )
    }
    render(<Harness />)
    act(() => {
      container
        .querySelector("form")
        ?.dispatchEvent(
          new SubmitEvent("submit", { bubbles: true, cancelable: true }),
        )
    })
    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        conditions: [{ sourceId: "999", value: { stageId: "777" } }],
      })
    })
  })

  test("keeps a saved stage that is absent from its loaded pipeline (deleted), not widening it", async () => {
    const onSubmit = vi.fn()
    function Harness() {
      const form = useForm({
        defaultValues: {
          conditions: [{ sourceId: "11", value: { stageId: "31" } }],
        },
      })
      return (
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit((values) => onSubmit(values))}>
            <ConditionEditor
              parentName="conditions.0"
              type={triggerEventTypes.enum.pipelineItemMovedToStage}
            />
          </form>
        </FormProvider>
      )
    }
    render(<Harness />)
    act(() => {
      container
        .querySelector("form")
        ?.dispatchEvent(
          new SubmitEvent("submit", { bubbles: true, cancelable: true }),
        )
    })
    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        conditions: [{ sourceId: "11", value: { stageId: "31" } }],
      })
    })
  })
})
