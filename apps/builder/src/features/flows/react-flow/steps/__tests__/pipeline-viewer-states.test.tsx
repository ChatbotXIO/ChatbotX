// @vitest-environment jsdom
import {
  type PipelineStepAction,
  type PipelineStepSchema,
  pipelineStepDefaultFn,
} from "@chatbotx.io/flow-config"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const connectedHandles = vi.hoisted(() => new Set<string>())

vi.mock("@xyflow/react", () => ({
  useNodeConnections: ({ handleId }: { handleId: string }) =>
    connectedHandles.has(handleId) ? [{ sourceHandle: handleId }] : [],
}))
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))
vi.mock("@/features/pipelines/lib/use-pipeline-options", () => ({
  usePipelineOptions: () => ({ pipelines: [], isLoading: false }),
}))
vi.mock("../base/viewer", () => ({
  BaseStepViewer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))
vi.mock("../../states/viewer", () => ({
  BaseStateViewer: ({ data }: { data: { stateType: string } }) => (
    <span data-state={data.stateType} />
  ),
}))
vi.mock("../pipeline/action-labels", () => ({
  usePipelineActionLabel: () => (action: string) => action,
}))

import PipelineStepViewer from "../pipeline/viewer"

const stepFor = (action: PipelineStepAction): PipelineStepSchema =>
  ({ ...pipelineStepDefaultFn(), action }) as PipelineStepSchema

describe("pipeline step viewer states", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    connectedHandles.clear()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const shownStates = () =>
    Array.from(container.querySelectorAll("[data-state]")).map((element) =>
      element.getAttribute("data-state"),
    )

  test("an action on the contact's open item shows success, error and skip", () => {
    act(() => root.render(<PipelineStepViewer data={stepFor("addComment")} />))
    expect(shownStates()).toEqual(["success", "error", "skip"])
  })

  test("adding to a pipeline never skips, so its skip handle is hidden", () => {
    act(() =>
      root.render(<PipelineStepViewer data={stepFor("addToPipeline")} />),
    )
    expect(shownStates()).toEqual(["success", "error"])
  })

  test("an already-connected skip handle stays so its edge is not orphaned", () => {
    const step = stepFor("addToPipeline")
    const skip = step.states.find((state) => state.stateType === "skip")
    connectedHandles.add(skip?.id ?? "")
    act(() => root.render(<PipelineStepViewer data={step} />))
    expect(shownStates()).toEqual(["success", "error", "skip"])
  })
})
