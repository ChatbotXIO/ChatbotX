// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, type UseFormReturn, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { FlowNodePickerFields } from "../flow-node-picker-fields"

type Option = { label: string; value: string }
type ComboProps = {
  name: string
  options: Option[]
  disableValues?: string[]
  emptyText?: string
  triggerValueChange?: (value: string) => void
}

const flowOptionsRef: { current: Option[] } = { current: [] }
const flowsRef: {
  current: Array<{
    id: string
    flowVersions: Array<{
      isLatest: boolean
      nodes: Array<{ id: string; data: { name: string } }>
    }>
  }>
} = { current: [] }

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))
vi.mock("@/hooks/routing", () => ({ useWorkspaceId: () => "workspace-1" }))
vi.mock("@/features/flows/provider/flow-hook", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/flows/provider/flow-hook")
  >("@/features/flows/provider/flow-hook")
  return {
    useFlowSelectOptions: () => flowOptionsRef.current,
    useFlows: () => ({ data: flowsRef.current }),
    // The real helper: options come from the latest version.
    getFlowNodesOptions: actual.getFlowNodesOptions,
  }
})

const setValueSpy = vi.fn()

vi.mock("@chatbotx.io/ui/components/form/combobox-field", () => ({
  ComboboxField: (props: ComboProps) => (
    <div data-testid={`combo-${props.name}`}>
      <span data-testid={`empty-${props.name}`}>{props.emptyText}</span>
      {props.options.map((option) => (
        <button
          data-disabled={String(
            props.disableValues?.includes(option.value) ?? false,
          )}
          data-testid={`opt-${props.name}-${option.value}`}
          key={option.value}
          onClick={() => props.triggerValueChange?.(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  ),
}))

let container: HTMLDivElement
let root: Root
let formApi: UseFormReturn<{ a: { flowId: string; nodeId: string } }> | null =
  null

const Harness = ({
  flowId,
  disabledFlowId,
}: {
  flowId: string
  disabledFlowId?: string
}) => {
  const form = useForm({ defaultValues: { a: { flowId, nodeId: "22" } } })
  formApi = form
  const original = form.setValue
  form.setValue = ((...args: Parameters<typeof original>) => {
    setValueSpy(...args)
    return original(...args)
  }) as typeof original
  return (
    <FormProvider {...form}>
      <FlowNodePickerFields disabledFlowId={disabledFlowId} parentName="a" />
    </FormProvider>
  )
}

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  setValueSpy.mockClear()
  flowOptionsRef.current = [
    { label: "Flow A", value: "11" },
    { label: "Flow B", value: "12" },
  ]
  flowsRef.current = [
    {
      id: "11",
      flowVersions: [
        { isLatest: false, nodes: [{ id: "1", data: { name: "Old node" } }] },
        { isLatest: true, nodes: [{ id: "2", data: { name: "A node" } }] },
      ],
    },
    {
      id: "12",
      flowVersions: [
        { isLatest: true, nodes: [{ id: "3", data: { name: "B node" } }] },
      ],
    },
  ]
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const render = (props: { flowId: string; disabledFlowId?: string }) =>
  act(() => root.render(<Harness {...props} />))
const q = (id: string) => container.querySelector(`[data-testid="${id}"]`)

describe("FlowNodePickerFields", () => {
  test("disabledFlowId disables the current flow and leaves another selectable", () => {
    render({ flowId: "", disabledFlowId: "11" })

    expect(q("opt-a.flowId-11")?.getAttribute("data-disabled")).toBe("true")
    expect(q("opt-a.flowId-12")?.getAttribute("data-disabled")).toBe("false")
  })

  test("without disabledFlowId nothing is disabled", () => {
    render({ flowId: "" })

    expect(q("opt-a.flowId-11")?.getAttribute("data-disabled")).toBe("false")
    expect(q("opt-a.flowId-12")?.getAttribute("data-disabled")).toBe("false")
  })

  test("changing the flow clears nodeId", () => {
    render({ flowId: "11" })

    act(() => {
      ;(q("opt-a.flowId-12") as HTMLButtonElement).click()
    })

    expect(setValueSpy).toHaveBeenCalledWith("a.nodeId", "")
    expect(formApi?.getValues("a.nodeId")).toBe("")
  })

  test("node options follow the chosen flow's latest version", () => {
    render({ flowId: "11" })

    expect(q("opt-a.nodeId-2")?.textContent).toBe("A node")
    expect(q("opt-a.nodeId-1")).toBeNull()
    expect(q("opt-a.nodeId-3")).toBeNull()
  })

  test("node options update when the flow changes", () => {
    render({ flowId: "11" })

    act(() => {
      formApi?.setValue("a.flowId", "12")
    })

    expect(q("opt-a.nodeId-3")?.textContent).toBe("B node")
    expect(q("opt-a.nodeId-2")).toBeNull()
  })

  test("no nodes before a flow is chosen", () => {
    render({ flowId: "" })

    expect(q("combo-a.nodeId")?.querySelectorAll("button").length).toBe(0)
    expect(q("empty-a.nodeId")?.textContent).toBe("actions.noRecordFound")
  })

  test("empty state with no flows at all", () => {
    flowOptionsRef.current = []
    flowsRef.current = []

    render({ flowId: "11" })

    expect(q("combo-a.flowId")?.querySelectorAll("button").length).toBe(0)
    expect(q("combo-a.nodeId")?.querySelectorAll("button").length).toBe(0)
    expect(q("empty-a.flowId")?.textContent).toBe("actions.noRecordFound")
  })

  test("a flow without a latest version has no node options", () => {
    flowsRef.current = [
      {
        id: "11",
        flowVersions: [
          { isLatest: false, nodes: [{ id: "1", data: { name: "Old" } }] },
        ],
      },
    ]

    render({ flowId: "11" })

    expect(q("combo-a.nodeId")?.querySelectorAll("button").length).toBe(0)
  })
})
