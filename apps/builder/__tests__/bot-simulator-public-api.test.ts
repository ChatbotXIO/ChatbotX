import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findByIdForWorkspace: vi.fn(),
  resolveTenantSettings: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  integrationWebchatService: {
    findByIdForWorkspace: mocks.findByIdForWorkspace,
  },
  resolveTenantSettings: mocks.resolveTenantSettings,
}))

const { createBotSimulatorLink } = await import(
  "@/features/bot-simulator/lib/create-simulator-link"
)

const webchat = (overrides: Record<string, unknown> = {}) => ({
  id: "wc-1",
  enable: true,
  authorizedDomains: [] as string[],
  ...overrides,
})

const input = {
  workspaceId: "ws-1",
  webchatId: "wc-1",
  websiteUrl: "https://shop.example.com/pricing?a=1",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findByIdForWorkspace.mockResolvedValue(webchat())
  mocks.resolveTenantSettings.mockResolvedValue({
    appUrl: "https://app.tenant.test",
  })
})

describe("createBotSimulatorLink", () => {
  test("builds the /bs link on the tenant's app URL", async () => {
    const url = new URL(await createBotSimulatorLink(input))

    expect(url.origin).toBe("https://app.tenant.test")
    expect(url.pathname).toBe("/bs/ws-1/wc-1")
    expect(url.searchParams.get("url")).toBe(
      "https://shop.example.com/pricing?a=1",
    )
    expect(mocks.findByIdForWorkspace).toHaveBeenCalledWith({
      id: "wc-1",
      workspaceId: "ws-1",
    })
  })

  test.each([
    "javascript:alert(1)",
    "not a url",
    "",
  ])("rejects a non-http(s) website %j before any lookup", async (websiteUrl) => {
    await expect(
      createBotSimulatorLink({ ...input, websiteUrl }),
    ).rejects.toMatchObject({ code: "validation", field: "websiteUrl" })
    expect(mocks.findByIdForWorkspace).not.toHaveBeenCalled()
  })

  test("rejects a disabled webchat", async () => {
    mocks.findByIdForWorkspace.mockResolvedValueOnce(webchat({ enable: false }))

    await expect(createBotSimulatorLink(input)).rejects.toMatchObject({
      code: "validation",
      field: "webchatId",
    })
  })

  test("rejects a website outside the webchat's allowed domains", async () => {
    mocks.findByIdForWorkspace.mockResolvedValueOnce(
      webchat({ authorizedDomains: ["other.test"] }),
    )

    await expect(createBotSimulatorLink(input)).rejects.toMatchObject({
      code: "validation",
      field: "websiteUrl",
    })
  })

  test("accepts a subdomain of an allowed domain", async () => {
    mocks.findByIdForWorkspace.mockResolvedValueOnce(
      webchat({ authorizedDomains: ["example.com"] }),
    )

    await expect(createBotSimulatorLink(input)).resolves.toContain("/bs/")
  })

  test("propagates not-found for a webchat of another workspace", async () => {
    const notFound = Object.assign(new Error("nf"), { code: "notFound" })
    mocks.findByIdForWorkspace.mockRejectedValueOnce(notFound)

    await expect(createBotSimulatorLink(input)).rejects.toBe(notFound)
  })
})
