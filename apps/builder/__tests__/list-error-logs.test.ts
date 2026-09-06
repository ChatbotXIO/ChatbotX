// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listErrorLogs: vi.fn(),
}))

vi.mock("@chatbotx.io/business/error-log", () => ({
  listErrorLogs: mocks.listErrorLogs,
}))

const { listErrorLogs } = await import(
  "../src/features/error-logs/queries/index"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listErrorLogs.mockResolvedValue({ data: [], pageCount: 0 })
})

describe("listErrorLogs", () => {
  // The where-shape / provider-label behavior now lives in
  // packages/business/__tests__/error-log.list.test.ts, alongside the
  // service the query file delegates to. This test only proves the
  // delegation itself.
  test("delegates to the business listErrorLogs service with the given input", async () => {
    const input = { workspaceId: "ws-1", keyword: "timeout" }

    const result = await listErrorLogs(input)

    expect(mocks.listErrorLogs).toHaveBeenCalledWith(input)
    expect(result).toEqual({ data: [], pageCount: 0 })
  })
})
