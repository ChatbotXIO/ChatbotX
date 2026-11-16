// @vitest-environment node
import { describe, expect, test, vi } from "vitest"

const row = {
  id: "10",
  workspaceId: "w1",
  inboxId: "20",
  channelId: "123",
  name: "Shop",
  basicId: "@shop",
  pictureUrl: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  tokenRefreshError: "secret-ish",
  auth: {
    clientId: "123",
    clientSecret: "SECRET-VALUE",
    tokens: { accessToken: "TOKEN-VALUE", expiresAt: "2026-02-01T00:00:00Z" },
  },
}

vi.mock("@chatbotx.io/business", () => ({
  lineIntegrationService: { listByWorkspace: vi.fn(async () => [row]) },
}))

import { listIntegrationLines } from "@/features/integration-line/queries"

describe("listIntegrationLines", () => {
  test("returns only the public projection (no auth, secret or token)", async () => {
    const { data } = await listIntegrationLines({
      where: { workspaceId: "w1" },
    })
    expect(data).toHaveLength(1)
    expect(Object.keys(data[0] ?? {}).sort()).toEqual([
      "basicId",
      "channelId",
      "createdAt",
      "id",
      "inboxId",
      "name",
      "pictureUrl",
    ])
    const serialized = JSON.stringify(data)
    expect(serialized).not.toContain("SECRET-VALUE")
    expect(serialized).not.toContain("TOKEN-VALUE")
    expect(serialized).not.toContain("auth")
  })
})
