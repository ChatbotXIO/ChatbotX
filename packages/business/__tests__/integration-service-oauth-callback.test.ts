import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// integrationService.createFromOAuthCallback — the googleSheets branch
// inserts both the generic Integration row and the type-specific
// IntegrationGoogleSheets row in one transaction; other types insert only
// the Integration row.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  insert: vi.fn(),
  createId: vi.fn(() => "integration-1"),
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: mocks.createId,
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn(),
  db: { transaction: mocks.transaction },
  eq: vi.fn(),
  exists: vi.fn(),
  isNotNull: vi.fn(),
  isNull: vi.fn(),
  ne: vi.fn(),
  or: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationGoogleSheetsModel: { workspaceId: "workspaceId" },
  integrationInstagramModel: {},
  integrationMessengerModel: {},
  integrationMetaCatalogModel: {},
  integrationModel: { id: "id", workspaceId: "workspaceId" },
  integrationTiktokModel: {},
  integrationWhatsappModel: {},
  integrationZaloModel: {},
}))

const { integrationService } = await import("../src/integration/service")

function mutationChain() {
  const builder = {
    values: vi.fn(() => Promise.resolve(undefined)),
  }
  return builder
}

describe("integrationService.createFromOAuthCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createId.mockReturnValue("integration-1")
    mocks.transaction.mockImplementation(
      async (callback: (client: unknown) => Promise<unknown>) => {
        const tx = { insert: mocks.insert }
        return await callback(tx)
      },
    )
    mocks.insert.mockReturnValue(mutationChain())
  })

  test("googleSheets branch inserts both rows in one transaction", async () => {
    const result = await integrationService.createFromOAuthCallback({
      workspaceId: "ws_1",
      integrationType: "googleSheets",
      googleSheetsAuth: { accessToken: "tok" } as never,
    })

    expect(result).toEqual({ integrationId: "integration-1" })
    expect(mocks.transaction).toHaveBeenCalledOnce()
    expect(mocks.insert).toHaveBeenCalledTimes(2)
  })

  test("other integration types insert only the Integration row", async () => {
    const result = await integrationService.createFromOAuthCallback({
      workspaceId: "ws_1",
      integrationType: "zalo",
    })

    expect(result).toEqual({ integrationId: "integration-1" })
    expect(mocks.insert).toHaveBeenCalledTimes(1)
  })

  test("googleSheets without an auth value inserts only the Integration row", async () => {
    await integrationService.createFromOAuthCallback({
      workspaceId: "ws_1",
      integrationType: "googleSheets",
      googleSheetsAuth: null,
    })

    expect(mocks.insert).toHaveBeenCalledTimes(1)
  })
})
