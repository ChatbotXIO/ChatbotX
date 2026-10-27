// @vitest-environment jsdom

import { Form } from "@chatbotx.io/ui/components/ui/form"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { type UseFormReturn, useForm } from "react-hook-form"
import { afterEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock("@/features/pipelines/lib/use-pipeline-options", () => ({
  usePipelineOptions: () => ({
    isLoading: false,
    pipelines: [
      { id: "p1", name: "Sales", stages: [{ id: "s1", name: "Lead" }] },
      { id: "p2", name: "Support", stages: [{ id: "s2", name: "New" }] },
    ],
  }),
}))
// The picker as a plain list of its options: labels can be read, and a click
// picks one the way the real picker does (form value, then the callback).
vi.mock("@chatbotx.io/ui/components/form/combobox-field", async () => {
  const { useFormContext } = await import("react-hook-form")
  return {
    ComboboxField: ({
      name,
      options,
      triggerValueChange,
    }: {
      name: string
      options: { value: string; label: string }[]
      triggerValueChange?: (value: string) => void
    }) => {
      const form = useFormContext()
      return (
        <ul data-name={name}>
          {options.map((option) => (
            <li key={option.value}>
              <button
                data-value={option.value}
                onClick={() => {
                  form.setValue(name, option.value)
                  triggerValueChange?.(option.value)
                }}
                type="button"
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )
    },
  }
})

import { PipelineItemCondition } from "@/features/conditions/pipeline-item-condition"

type Values = { c: { sourceId: string | null; value: { stageId: string } } }

let form: UseFormReturn<Values> | null = null

function Host({ defaults }: { defaults: Values }) {
  const methods = useForm<Values>({ defaultValues: defaults })
  form = methods
  return (
    <Form {...methods}>
      <PipelineItemCondition parentName="c" type="pipelineItemMovedToStage" />
    </Form>
  )
}

const containers: HTMLElement[] = []

function mount(defaults: Values) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement("div")
  document.body.append(container)
  containers.push(container)
  act(() => {
    createRoot(container).render(<Host defaults={defaults} />)
  })
  return container
}

const pick = (container: HTMLElement, name: string, value: string) =>
  act(() => {
    container
      .querySelector<HTMLElement>(
        `[data-name="${name}"] [data-value="${value}"]`,
      )
      ?.click()
  })

const labelsOf = (container: HTMLElement, name: string) =>
  Array.from(container.querySelectorAll(`[data-name="${name}"] li`)).map(
    (item) => item.textContent,
  )

afterEach(() => {
  for (const container of containers.splice(0)) {
    container.remove()
  }
  form = null
})

describe("PipelineItemCondition with deleted references", () => {
  test("a deleted pipeline and stage stay selected and are labelled, not shown as any", () => {
    const container = mount({
      c: { sourceId: "p-gone", value: { stageId: "s-gone" } },
    })

    expect(labelsOf(container, "c.sourceId")).toContain(
      "trigger.conditions.unavailablePipeline",
    )
    expect(labelsOf(container, "c.value.stageId")).toContain(
      "trigger.conditions.unavailableStage",
    )
    expect(form?.getValues("c.value.stageId")).toBe("s-gone")
  })

  test("opening a condition whose stage was deleted does not widen it to any stage", () => {
    mount({ c: { sourceId: "p1", value: { stageId: "s-gone" } } })

    expect(form?.getValues("c.value.stageId")).toBe("s-gone")
  })

  test("choosing another pipeline clears the previous pipeline's stage", () => {
    const container = mount({ c: { sourceId: "p1", value: { stageId: "s1" } } })

    pick(container, "c.sourceId", "p2")

    expect(form?.getValues("c.value.stageId")).toBe("")
  })

  test("switching to any pipeline keeps the stage, which stays a valid choice", () => {
    const container = mount({ c: { sourceId: "p1", value: { stageId: "s1" } } })

    pick(container, "c.sourceId", "")

    expect(form?.getValues("c.value.stageId")).toBe("s1")
  })

  test("a pipeline change that is not a pick (form reset or reuse) keeps the stage", () => {
    mount({ c: { sourceId: "p1", value: { stageId: "s-gone" } } })

    act(() => {
      form?.setValue("c.sourceId", "p2")
    })

    expect(form?.getValues("c.value.stageId")).toBe("s-gone")
  })

  test("re-picking the unavailable pipeline keeps its saved stage", () => {
    const container = mount({
      c: { sourceId: "p-gone", value: { stageId: "s-gone" } },
    })

    pick(container, "c.sourceId", "p-gone")

    expect(form?.getValues("c.value.stageId")).toBe("s-gone")
  })
})
