import { beforeEach, describe, expect, test, vi } from "vitest"

// Reset is a destructive bulk operation (clears every selected Account
// Field's value). This pins the action boundary: the bound workspaceId and
// the selected ids — and nothing else — reach `botFieldService.bulkClearValues`,
// which itself scopes the UPDATE by both workspaceId AND id IN (...).

const mocks = vi.hoisted(() => ({
  bulkClearValues: vi.fn(async () => undefined),
}))

vi.mock("@chatbotx.io/business", () => ({
  botFieldService: { bulkClearValues: mocks.bulkClearValues },
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: () => ({
      inputSchema: () => ({ action: (handler: unknown) => handler }),
    }),
  },
}))

import { resetBotFields } from "@/features/bot-fields/actions/reset-bot-field.action"

describe("resetBotFields", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("forwards the bound workspaceId and selected ids to bulkClearValues", async () => {
    await resetBotFields("ws-1", ["11", "22"])

    expect(mocks.bulkClearValues).toHaveBeenCalledTimes(1)
    expect(mocks.bulkClearValues).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["11", "22"],
    })
  })
})
