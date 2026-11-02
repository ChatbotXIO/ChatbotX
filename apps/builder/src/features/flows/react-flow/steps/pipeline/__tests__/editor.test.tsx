// @vitest-environment jsdom
import { pipelineStepDefaultFn } from "@chatbotx.io/flow-config"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, type UseFormReturn, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { PipelineActionEditor } from "@/features/triggers/components/actions/pipeline-action-editor"
import PipelineStepEditor from "../editor"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))

vi.mock("@/features/pipelines/lib/use-pipeline-options", () => ({
  usePipelineOptions: () => ({
    pipelines: [
      { id: "101", name: "Sales" },
      { id: "102", name: "Support" },
    ],
  }),
}))

vi.mock("../action-labels", () => ({
  usePipelineActionLabel: () => (value: string) => value,
}))

// Renders the action's leftovers so a stale field would be visible.
vi.mock("../action-fields", async () => {
  const { useFormContext } = await import("react-hook-form")
  return {
    PipelineActionFields: ({ parentName }: { parentName: string }) => {
      const { getValues } = useFormContext()
      return (
        <pre data-testid="fields">{JSON.stringify(getValues(parentName))}</pre>
      )
    },
  }
})

vi.mock("../../base/editor", () => ({
  BaseStepEditor: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("@chatbotx.io/ui/components/form/select-field", async () => {
  const { Controller, useFormContext } = await import("react-hook-form")
  return {
    SelectField: ({
      name,
      options,
      triggerValueChange,
    }: {
      name: string
      options: { label: string; value: string }[]
      triggerValueChange?: (value: string) => void
    }) => {
      const { control } = useFormContext()
      return (
        <Controller
          control={control}
          name={name}
          render={({ field }) => (
            <select
              data-testid={`select-${name}`}
              onChange={(event) => {
                field.onChange(event.target.value)
                triggerValueChange?.(event.target.value)
              }}
              value={field.value ?? ""}
            >
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        />
      )
    },
  }
})

vi.mock("@chatbotx.io/ui/components/form/combobox-field", async () => {
  const { Controller, useFormContext } = await import("react-hook-form")
  return {
    ComboboxField: ({
      name,
      options,
      triggerValueChange,
    }: {
      name: string
      options: { label: string; value: string }[]
      triggerValueChange?: (value: string) => void
    }) => {
      const { control } = useFormContext()
      return (
        <Controller
          control={control}
          name={name}
          render={({ field }) => (
            <select
              data-testid={`combo-${name}`}
              onChange={(event) => {
                field.onChange(event.target.value)
                triggerValueChange?.(event.target.value)
              }}
              value={field.value ?? ""}
            >
              <option value="">--</option>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        />
      )
    },
  }
})

let container: HTMLDivElement
let root: Root
let formApi: UseFormReturn<{ item: Record<string, unknown> }> | null = null

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  formApi = null
})

const Harness = ({
  initial,
  children,
}: {
  initial: Record<string, unknown>
  children: ReactNode
}) => {
  const form = useForm<{ item: Record<string, unknown> }>({
    defaultValues: { item: initial },
  })
  formApi = form
  return <FormProvider {...form}>{children}</FormProvider>
}

const mount = (initial: Record<string, unknown>, step: boolean) =>
  act(() =>
    root.render(
      <Harness initial={initial}>
        {step ? (
          <PipelineStepEditor parentName="item" />
        ) : (
          <PipelineActionEditor parentName="item" />
        )}
      </Harness>,
    ),
  )

const change = (testId: string, value: string) =>
  act(() => {
    const select = container.querySelector(
      `[data-testid="${testId}"]`,
    ) as HTMLSelectElement
    select.value = value
    select.dispatchEvent(new Event("change", { bubbles: true }))
  })

const item = () => formApi?.getValues("item") as Record<string, unknown>

describe("trigger pipeline action editor", () => {
  const stored = {
    type: "pipeline",
    pipelineId: "101",
    action: "moveToStage",
    stageId: "201",
  }

  test("changing the action resets the payload to that action's defaults", () => {
    mount(stored, false)

    change("select-item.action", "changeValue")

    expect(item()).toEqual({
      type: "pipeline",
      pipelineId: "101",
      action: "changeValue",
      value: "",
    })
    expect(item()).not.toHaveProperty("stageId")
  })

  test("changing the pipeline (same action) resets dependent values", () => {
    mount(
      {
        type: "pipeline",
        pipelineId: "101",
        action: "assign",
        assigneeMemberIds: ["1"],
        assigneeInboxTeamIds: ["2"],
      },
      false,
    )

    change("combo-item.pipelineId", "102")

    expect(item()).toEqual({
      type: "pipeline",
      pipelineId: "102",
      action: "assign",
      assigneeMemberIds: [],
      assigneeInboxTeamIds: [],
    })
  })

  test("changing the pipeline drops the stage picked in the old one", () => {
    mount(stored, false)

    change("combo-item.pipelineId", "102")

    expect(item()).toMatchObject({ pipelineId: "102", stageId: "" })
  })
})

describe("flow pipeline step editor", () => {
  const states = [
    { id: "s1", type: "success", nextStepId: "n1" },
    { id: "s2", type: "error", nextStepId: "n2" },
    { id: "s3", type: "skip", nextStepId: "n3" },
  ]
  const stored = () => ({
    ...pipelineStepDefaultFn("moveToStage", { pipelineId: "101" }),
    id: "777",
    stageId: "201",
    states,
  })

  test("changing the action keeps the step id and routing states", () => {
    mount(stored(), true)

    change("select-item.action", "addComment")

    expect(item()).toMatchObject({
      id: "777",
      stepType: "pipeline",
      pipelineId: "101",
      action: "addComment",
      text: "",
      states,
    })
    expect(item()).not.toHaveProperty("stageId")
  })

  test("changing the pipeline keeps the step id and routing states", () => {
    mount(stored(), true)

    change("combo-item.pipelineId", "102")

    expect(item()).toMatchObject({
      id: "777",
      pipelineId: "102",
      action: "moveToStage",
      stageId: "",
      states,
    })
  })
})
