// @vitest-environment jsdom
import { pipelineStepDefaultFn } from "@chatbotx.io/flow-config"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  type FieldValues,
  FormProvider,
  type UseFormReturn,
  useForm,
} from "react-hook-form"
import { afterEach, describe, expect, test, vi } from "vitest"
import { PipelineActionFields } from "../action-fields"

/** Echoes the key plus interpolated values, independent of the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}(${Object.values(values).join("|")})` : key,
}))

vi.mock("../use-pipeline-fields", () => ({
  usePipelineFields: () => ({
    fields: [
      { id: "10", name: "Budget", required: true },
      { id: "11", name: "Notes", required: false },
      { id: "12", name: "Company", required: true },
    ],
  }),
}))

vi.mock("@/features/pipelines/lib/use-pipeline-options", () => ({
  usePipelineOptions: () => ({ pipelines: [] }),
}))
vi.mock("@/features/pipelines/lib/use-assignee-options", () => ({
  useAssigneeOptions: () => [],
}))
vi.mock("@/hooks/routing", () => ({ useWorkspaceId: () => "ws-1" }))
vi.mock("../due-date-fields", () => ({ PipelineDueDateFields: () => null }))
vi.mock("@/components/tiptap/plain-text-editor-field", () => ({
  PlainTextEditorField: () => null,
}))
vi.mock("@chatbotx.io/ui/components/form/multi-select-field", () => ({
  MultiSelectField: () => null,
}))
vi.mock("@chatbotx.io/ui/components/form/select-field", () => ({
  SelectField: () => null,
}))
vi.mock("@chatbotx.io/ui/components/form/combobox-field", () => ({
  ComboboxField: ({ name }: { name: string }) => (
    <span data-testid="field-row">{name}</span>
  ),
}))

let container: HTMLDivElement | null = null
let root: Root | null = null
let form: UseFormReturn | null = null

const PARENT = "step"

function Harness({ fieldValues }: { fieldValues: unknown[] }) {
  const methods = useForm<FieldValues>({
    defaultValues: {
      [PARENT]: {
        ...pipelineStepDefaultFn("addToPipeline", { pipelineId: "101" }),
        fieldValues,
      },
    },
  })
  form = methods
  return (
    <FormProvider {...methods}>
      <PipelineActionFields
        action="addToPipeline"
        parentName={PARENT}
        pipelineId="101"
      />
    </FormProvider>
  )
}

const render = (fieldValues: unknown[]) => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root?.render(<Harness fieldValues={fieldValues} />))
  return container
}

const addRequiredButton = () =>
  Array.from(
    container?.querySelectorAll("button") ?? ([] as HTMLButtonElement[]),
  ).find((button) =>
    button.textContent?.includes("flows.pipelineStep.addRequiredFields"),
  )

afterEach(() => {
  if (root) {
    act(() => root?.unmount())
  }
  container?.remove()
  container = null
  root = null
  form = null
})

describe("Add to pipeline: required field warning", () => {
  test("names every required field without a value", () => {
    const el = render([])

    expect(el.textContent).toContain(
      "flows.pipelineStep.missingRequiredFields(Budget, Company)",
    )
    expect(addRequiredButton()).toBeDefined()
  })

  test("the add button appends a row for each missing required field", () => {
    render([])

    act(() => addRequiredButton()?.click())

    expect(form?.getValues(`${PARENT}.fieldValues`)).toEqual([
      { pipelineFieldId: "10", value: "" },
      { pipelineFieldId: "12", value: "" },
    ])
    // Rows exist now but are still empty: the warning stays, the button goes.
    expect(container?.textContent).toContain(
      "flows.pipelineStep.missingRequiredFields(Budget, Company)",
    )
    expect(addRequiredButton()).toBeUndefined()
  })

  test("no warning once every required field has a value", () => {
    const el = render([
      { pipelineFieldId: "10", value: "500" },
      { pipelineFieldId: "12", value: "{{company}}" },
    ])

    expect(el.textContent).not.toContain(
      "flows.pipelineStep.missingRequiredFields",
    )
  })
})
