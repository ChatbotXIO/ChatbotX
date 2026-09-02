// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  assertCurrentUserCanAccessChatbot: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
}))

vi.mock("@/lib/auth/utils", () => ({
  assertCurrentUserCanAccessChatbot: mocks.assertCurrentUserCanAccessChatbot,
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: { errorLogModel: { findMany: mocks.findMany } },
    $count: mocks.count,
  },
  relationsFilterToSQL: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  errorLogModel: { _: "ErrorLog" },
}))

const { listErrorLogs } = await import(
  "../src/features/error-logs/queries/index"
)

/** The `where` the query handed to drizzle. */
const whereClause = () => mocks.findMany.mock.calls[0]?.[0]?.where

beforeEach(() => {
  vi.clearAllMocks()
  mocks.assertCurrentUserCanAccessChatbot.mockResolvedValue(undefined)
  mocks.findMany.mockResolvedValue([])
  mocks.count.mockResolvedValue(0)
})

describe("listErrorLogs", () => {
  // The Type column renders "Email" while `action` stores `smtp`, so an `ilike`
  // on the column alone finds nothing for the value the user is looking at.
  test("matches a provider by the label the table shows, not just the stored slug", async () => {
    await listErrorLogs({ workspaceId: "ws-1", keyword: "Email" })

    expect(whereClause().OR).toContainEqual({ action: { in: ["smtp"] } })
  })

  test("keeps the free-text search over action and detail", async () => {
    await listErrorLogs({ workspaceId: "ws-1", keyword: "timeout" })

    const or = whereClause().OR
    expect(or).toContainEqual({ action: { ilike: "%timeout%" } })
    expect(or).toContainEqual({ detail: { ilike: "%timeout%" } })
    // Nothing is labelled "timeout", so no provider term is added.
    expect(or).toHaveLength(2)
  })

  test("applies no search terms without a keyword", async () => {
    await listErrorLogs({ workspaceId: "ws-1" })

    expect(whereClause()).toEqual({ workspaceId: "ws-1" })
    expect(mocks.assertCurrentUserCanAccessChatbot).toHaveBeenCalledWith("ws-1")
  })
})
