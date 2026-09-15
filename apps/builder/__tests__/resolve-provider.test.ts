// @vitest-environment node

import { describe, expect, test, vi } from "vitest"

vi.mock("@chatbotx.io/connections", () => ({
  CONNECTION_REGISTRY: {
    messenger: {
      provider: {
        strategy: "oauth_redirect",
        multiAccount: true,
        verify: vi.fn(),
      },
      integration: { refreshAuth: vi.fn() },
    },
  },
}))

const { toConnectionResource } = await import(
  "../src/features/connections/lib/resolve-provider"
)

describe("toConnectionResource", () => {
  test("never emits an auth-like key even when the row carries one (T5)", () => {
    const row = {
      id: "conn-1",
      workspaceId: "ws-1",
      kind: "channel",
      provider: "messenger",
      channel: "messenger",
      status: "connected",
      statusReason: null,
      sourceId: "page-1",
      displayName: "My Page",
      inboxId: "inbox-1",
      integrationId: null,
      authExpiresAt: null,
      lastError: null,
      connectedAt: new Date("2026-01-01T00:00:00.000Z"),
      disconnectedAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      createdBy: null,
      // Simulates a future column addition or a caller that forwards the
      // full row without stripping the credential first — the DTO
      // projection must still exclude it, not rely on the caller.
      auth: { accessToken: "secret-token" },
      encryptedAuth: { iv: "iv", content: "encrypted", tag: "tag" },
    } as any

    const resource = toConnectionResource(row)

    expect(resource).not.toHaveProperty("auth")
    expect(resource).not.toHaveProperty("encryptedAuth")
    expect(JSON.stringify(resource)).not.toContain("secret-token")
  })

  test("resolves capabilities from the registry adapter", () => {
    const row = {
      id: "conn-1",
      kind: "channel",
      provider: "messenger",
      channel: "messenger",
      status: "connected",
      statusReason: null,
      sourceId: "page-1",
      displayName: "My Page",
      inboxId: "inbox-1",
      integrationId: null,
      authExpiresAt: null,
      lastError: null,
      connectedAt: null,
      disconnectedAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    } as any

    const resource = toConnectionResource(row)

    expect(resource.strategy).toBe("oauth_redirect")
    expect(resource.capabilities).toEqual({
      refreshable: true,
      verifiable: true,
      multiAccount: true,
    })
  })
})
