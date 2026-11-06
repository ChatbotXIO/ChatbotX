// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"

const invalidators = vi.hoisted(() => ({
  flow: vi.fn(),
  tag: vi.fn(),
  customField: vi.fn(),
  botField: vi.fn(),
  sequence: vi.fn(),
  aiAgent: vi.fn(),
  pipeline: vi.fn(),
}))

vi.mock("@/features/flows/provider/flow-hook", () => ({
  useInvalidateFlows: () => invalidators.flow,
}))
vi.mock("@/features/tags/provider/tag-hook", () => ({
  useInvalidateTags: () => invalidators.tag,
}))
vi.mock("@/features/custom-fields/provider/custom-field-hook", () => ({
  useInvalidateCustomFields: () => invalidators.customField,
  useInvalidateBotFields: () => invalidators.botField,
}))
vi.mock("@/features/sequences/provider/sequence-hook", () => ({
  useInvalidateSequences: () => invalidators.sequence,
}))
vi.mock("@/features/ai-agents/hooks/use-ai-agents", () => ({
  useInvalidateAIAgents: () => invalidators.aiAgent,
}))
vi.mock("@/features/pipelines/lib/use-invalidate-pipelines", () => ({
  useInvalidatePipelines: () => invalidators.pipeline,
}))
vi.mock("@/lib/orpc/query", () => ({
  orpc: { templatesAPI: { key: () => ["templatesAPI"] } },
}))

const { useInvalidateAfterTemplateChange } = await import(
  "@/features/templates/lib/use-invalidate-template-kinds"
)

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | undefined
let container: HTMLDivElement | undefined
let api: ReturnType<typeof useInvalidateAfterTemplateChange> | undefined

function Probe() {
  api = useInvalidateAfterTemplateChange()
  return null
}

const mount = (client: QueryClient) => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    )
  })
}

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  for (const fn of Object.values(invalidators)) {
    fn.mockClear()
  }
})

describe("useInvalidateAfterTemplateChange", () => {
  test("invalidateLocks drops every templatesAPI query with one call", async () => {
    const client = new QueryClient()
    const spy = vi.spyOn(client, "invalidateQueries")
    mount(client)

    await api?.invalidateLocks()

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith({ queryKey: ["templatesAPI"] })
  })

  // An uninstall removes copies, so the per-kind lists must go stale too.
  test("invalidateAll refreshes the list of every cached kind", () => {
    mount(new QueryClient())

    api?.invalidateAll()

    for (const fn of Object.values(invalidators)) {
      expect(fn).toHaveBeenCalledTimes(1)
    }
  })

  test("invalidateKinds refreshes only the named kinds, once each", () => {
    mount(new QueryClient())

    api?.invalidateKinds(["flow", "flow", "tag", "channel" as never])

    expect(invalidators.flow).toHaveBeenCalledTimes(1)
    expect(invalidators.tag).toHaveBeenCalledTimes(1)
    expect(invalidators.pipeline).not.toHaveBeenCalled()
  })
})
