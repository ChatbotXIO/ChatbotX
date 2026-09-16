// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type ActionHandler = (args: {
  bindArgsParsedInputs: readonly [string]
}) => Promise<{ providers: unknown[] }>

const { listConnectedCallSummaryProvidersMock } = vi.hoisted(() => ({
  listConnectedCallSummaryProvidersMock: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.action = (handler: unknown) => handler
  return { workspaceActionClientAllowExpired: chain }
})

vi.mock("@chatbotx.io/ai/server", () => ({
  listConnectedCallSummaryProviders: listConnectedCallSummaryProvidersMock,
}))

const { listCallSummaryProvidersAction } = await import(
  "../src/features/messages/actions/list-call-summary-providers.action"
)
const getAction = listCallSummaryProvidersAction as unknown as ActionHandler

describe("listCallSummaryProvidersAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns the connected providers for the caller's workspace", async () => {
    const providers = [{ id: "int-1", provider: "openai", label: "OpenAI" }]
    listConnectedCallSummaryProvidersMock.mockResolvedValue(providers)

    const result = await getAction({ bindArgsParsedInputs: ["ws-1"] })

    expect(listConnectedCallSummaryProvidersMock).toHaveBeenCalledWith("ws-1")
    expect(result).toEqual({ providers })
  })

  test("returns an empty list rather than throwing when nothing is connected", async () => {
    listConnectedCallSummaryProvidersMock.mockResolvedValue([])

    const result = await getAction({ bindArgsParsedInputs: ["ws-1"] })

    expect(result).toEqual({ providers: [] })
  })
})
