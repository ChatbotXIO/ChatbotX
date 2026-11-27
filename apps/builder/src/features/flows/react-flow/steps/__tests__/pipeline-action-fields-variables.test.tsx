// @vitest-environment jsdom
import type { PipelineStepAction } from "@chatbotx.io/flow-config"
import type { ReactNode } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { PipelineActionFields } from "../pipeline/action-fields"

const plainTextEditorFieldMock = vi.fn()

vi.mock("@/components/tiptap/plain-text-editor-field", () => ({
  PlainTextEditorField: (props: {
    name: string
    includePipelineVariables?: boolean
    inline?: boolean
  }) => {
    plainTextEditorFieldMock(props)
    return <div data-testid={`text-${props.name}`} />
  },
}))
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))
vi.mock("@chatbotx.io/ui/components/form/combobox-field", () => ({
  ComboboxField: () => null,
}))
vi.mock("@chatbotx.io/ui/components/form/multi-select-field", () => ({
  MultiSelectField: () => null,
}))
vi.mock("@chatbotx.io/ui/components/form/select-field", () => ({
  SelectField: () => null,
}))
vi.mock("@/features/pipelines/lib/use-assignee-options", () => ({
  useAssigneeOptions: () => [],
}))
vi.mock("@/features/pipelines/lib/use-pipeline-options", () => ({
  usePipelineOptions: () => ({ pipelines: [], isLoading: false }),
}))
vi.mock("@/hooks/routing", () => ({ useWorkspaceId: () => "1" }))
vi.mock("../pipeline/due-date-fields", () => ({
  PipelineDueDateFields: () => null,
}))
vi.mock("../pipeline/use-pipeline-fields", () => ({
  usePipelineFields: () => ({ fields: [] }),
}))

function Host({ action }: { action: PipelineStepAction }): ReactNode {
  const form = useForm({ defaultValues: { step: {} } })
  return (
    <FormProvider {...form}>
      <PipelineActionFields action={action} parentName="step" pipelineId="9" />
    </FormProvider>
  )
}

describe("pipeline step text fields", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    plainTextEditorFieldMock.mockReset()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  // The step's texts are interpolated with `{{pipelines.*}}` at run time, so
  // the picker must offer them and stored tokens must render as labeled chips.
  test.each([
    "addToPipeline",
    "changeTitle",
    "changeDescription",
    "addComment",
  ] as const)("%s offers pipeline variables in every text field", (action) => {
    act(() => root.render(<Host action={action} />))

    expect(plainTextEditorFieldMock).toHaveBeenCalled()
    for (const [props] of plainTextEditorFieldMock.mock.calls) {
      expect(props).toMatchObject({ includePipelineVariables: true })
    }
  })

  // Long texts with variable chips must wrap; the inline layout never wraps.
  test("descriptions and comments are multi-line, titles stay single-line", () => {
    const layout = () =>
      Object.fromEntries(
        plainTextEditorFieldMock.mock.calls.map(([props]) => [
          props.name,
          Boolean(props.inline),
        ]),
      )
    act(() => root.render(<Host action="addToPipeline" />))
    expect(layout()).toMatchObject({
      "step.title": true,
      "step.description": false,
    })
    plainTextEditorFieldMock.mockReset()
    act(() => root.render(<Host action="addComment" />))
    expect(layout()).toMatchObject({ "step.text": false })
  })
})
