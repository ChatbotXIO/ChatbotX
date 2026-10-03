// @vitest-environment node
import { describe, expect, test, vi } from "vitest"

type CapturedProcedure = {
  route: { method: string; path: string }
  handler?: (...args: any[]) => any
}

const { orpcMock, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []
  const api = {
    route: (config: CapturedProcedure["route"]) => {
      const record: CapturedProcedure = { route: config }
      capturedProcedures.push(record)
      const chain: Record<string, unknown> = {}
      for (const name of ["input", "output", "errors"]) {
        chain[name] = () => chain
      }
      chain.handler = (fn: (...args: any[]) => any) => {
        record.handler = fn
        return { handler: fn }
      }
      return chain
    },
  }
  return {
    capturedProcedures,
    orpcMock: { workspaceTokenAuthAPIForScope: () => api },
  }
})
vi.mock("@/orpc", () => orpcMock)

const mocks = vi.hoisted(() => ({
  createUpload: vi.fn(),
  findForIntegration: vi.fn(),
}))
vi.mock("@/features/ads-campaign/lib/create-creative-image-upload", () => ({
  createAdsCreativeImageUpload: mocks.createUpload,
}))
vi.mock("@chatbotx.io/business", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  messagingAdsConnectionService: {
    findForIntegration: mocks.findForIntegration,
  },
}))
vi.mock("@chatbotx.io/database/client", () => {
  const proxy: unknown = new Proxy(() => proxy, { get: () => proxy })
  return { db: proxy }
})
vi.mock("@chatbotx.io/database/repositories", () => {
  const nested: unknown = new Proxy(
    {},
    { get: (_o, prop) => (prop === "then" ? undefined : nested) },
  )
  return new Proxy(
    {},
    { get: (_o, prop) => (prop === "then" ? undefined : nested) },
  ) as Record<string, unknown>
})

await import("@/features/ads-campaign/api/public")

const find = (method: string, path: string) =>
  capturedProcedures.find(
    (p) => p.route.method === method && p.route.path === path,
  )?.handler
const context = { workspace: { id: "ws-1" } }

describe("ads extras", () => {
  test("image upload mints for the token's workspace with no user", async () => {
    mocks.createUpload.mockResolvedValue({ fileId: "1" })

    await find(
      "POST",
      "/v1/ads/campaigns/upload-image",
    )?.({
      context,
      input: { fileName: "a.png", mimeType: "image/png", fileSize: 10 },
    })

    expect(mocks.createUpload).toHaveBeenCalledWith({
      fileName: "a.png",
      mimeType: "image/png",
      fileSize: 10,
      workspaceId: "ws-1",
      userId: null,
    })
  })

  test.each([
    ["active", { connected: true, reconnectNeeded: false }],
    ["invalid", { connected: false, reconnectNeeded: true }],
  ])("prerequisites with a %s connection", async (status, expected) => {
    mocks.findForIntegration.mockResolvedValue({ status })

    await expect(
      find(
        "GET",
        "/v1/ads/campaigns/prerequisites",
      )?.({
        context,
        input: { channel: "messenger", integrationId: "3" },
      }),
    ).resolves.toEqual(expected)
  })

  test("no connection is not a reconnect", async () => {
    mocks.findForIntegration.mockResolvedValue(undefined)

    await expect(
      find(
        "GET",
        "/v1/ads/campaigns/prerequisites",
      )?.({
        context,
        input: { channel: "messenger", integrationId: "3" },
      }),
    ).resolves.toEqual({ connected: false, reconnectNeeded: false })
  })
})
