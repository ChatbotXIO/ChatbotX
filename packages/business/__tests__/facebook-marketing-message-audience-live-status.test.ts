import { beforeEach, describe, expect, test, vi } from "vitest"

const repository = {
  listByWorkspaceId: vi.fn(),
  findForWorkspace: vi.fn(),
  create: vi.fn(),
  incrementRowsUploaded: vi.fn(),
  markReady: vi.fn(),
  remove: vi.fn(),
}
vi.mock("@chatbotx.io/database/repositories", () => ({
  facebookMarketingMessageAudienceRepository: repository,
}))
vi.mock("../src/audit/dispatcher", () => ({ dispatchAuditRecord: vi.fn() }))

class FacebookAdsException extends Error {}
const graph = {
  FacebookAdsException,
  createMarketingMessagesAudience: vi.fn(),
  uploadAudienceUsersSession: vi.fn(),
  deleteCustomAudience: vi.fn(),
  getMarketingMessagesAudiences: vi.fn(),
  getNotificationMessageTokenAudienceIds: vi.fn(),
  AudienceUploadError: class extends Error {},
}
vi.mock("@chatbotx.io/integration-facebook-ads", () => graph)

const { facebookMarketingMessageAudienceService: service } = await import(
  "../src/facebook-marketing-message-audience/service"
)

const grant = { accessToken: "T", version: "v25.0", facebookUserId: null }
const row = (overrides: Record<string, unknown>) => ({
  id: "row",
  customAudienceId: "aud",
  adAccountId: "act_1",
  pageId: "page_1",
  readyAt: null,
  ...overrides,
})
const meta = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: id,
  description: null,
  deliveryStatus: { code: 200, description: "Ready" },
  operationStatus: null,
  approximateCountLowerBound: 1000,
  approximateCountUpperBound: 1200,
  pageId: "page_1",
  ...overrides,
})
const resolvePageToken = vi.fn()
const live = (rowsGrant = grant) => ({
  workspaceId: "w1",
  grant: rowsGrant,
  resolvePageToken,
})

beforeEach(() => {
  vi.clearAllMocks()
  resolvePageToken.mockResolvedValue({ accessToken: "PAGE_TOKEN" })
  graph.getNotificationMessageTokenAudienceIds.mockResolvedValue([])
})

describe("getLiveStatus", () => {
  test("no rows → no Graph calls", async () => {
    repository.listByWorkspaceId.mockResolvedValue([])
    await expect(service.getLiveStatus(live())).resolves.toEqual({})
    expect(graph.getMarketingMessagesAudiences).not.toHaveBeenCalled()
  })

  test("merges counts and delivery status, and persists newly-ready rows", async () => {
    repository.listByWorkspaceId.mockResolvedValue([
      row({ id: "r1", customAudienceId: "aud_1" }),
      row({ id: "r2", customAudienceId: "aud_2" }),
    ])
    graph.getMarketingMessagesAudiences.mockResolvedValue([
      meta("aud_1"),
      meta("aud_2", {
        deliveryStatus: { code: 300, description: "Too small" },
      }),
      meta("aud_other"),
    ])
    graph.getNotificationMessageTokenAudienceIds.mockImplementation(
      ({ customAudienceId }: { customAudienceId: string }) =>
        Promise.resolve(customAudienceId === "aud_1" ? ["aud_1"] : []),
    )

    const result = await service.getLiveStatus(live())

    expect(result).toEqual({
      aud_1: {
        lower: 1000,
        upper: 1200,
        deliveryStatus: { code: 200, description: "Ready" },
        ready: true,
        missingOnMeta: false,
        pageDisconnected: false,
      },
      aud_2: {
        lower: 1000,
        upper: 1200,
        deliveryStatus: { code: 300, description: "Too small" },
        ready: false,
        missingOnMeta: false,
        pageDisconnected: false,
      },
    })
    expect(graph.getNotificationMessageTokenAudienceIds).toHaveBeenCalledWith({
      pageAccessToken: "PAGE_TOKEN",
      pageId: "page_1",
      customAudienceId: "aud_1",
      version: "v25.0",
    })
    expect(repository.markReady).toHaveBeenCalledWith({
      ids: ["r1"],
      workspaceId: "w1",
      readyAt: expect.any(Date),
    })
  })

  test("a markReady persistence failure is swallowed and the live status still returned", async () => {
    repository.listByWorkspaceId.mockResolvedValue([
      row({ id: "r1", customAudienceId: "aud_1" }),
    ])
    graph.getMarketingMessagesAudiences.mockResolvedValue([meta("aud_1")])
    graph.getNotificationMessageTokenAudienceIds.mockResolvedValue(["aud_1"])
    repository.markReady.mockRejectedValue(new Error("db down"))
    const result = await service.getLiveStatus(live())
    expect(result.aud_1?.ready).toBe(true)
    expect(repository.markReady).toHaveBeenCalledTimes(1)
  })

  test("rows already ready skip the token call", async () => {
    repository.listByWorkspaceId.mockResolvedValue([
      row({ id: "r1", customAudienceId: "aud_1", readyAt: new Date() }),
    ])
    graph.getMarketingMessagesAudiences.mockResolvedValue([meta("aud_1")])
    const result = await service.getLiveStatus(live())
    expect(result.aud_1?.ready).toBe(true)
    expect(graph.getNotificationMessageTokenAudienceIds).not.toHaveBeenCalled()
    expect(repository.markReady).not.toHaveBeenCalled()
  })

  test("an audience absent from Meta is missingOnMeta and gets no token call", async () => {
    repository.listByWorkspaceId.mockResolvedValue([
      row({ id: "r1", customAudienceId: "aud_gone" }),
    ])
    graph.getMarketingMessagesAudiences.mockResolvedValue([])
    const result = await service.getLiveStatus(live())
    expect(result.aud_gone).toMatchObject({ missingOnMeta: true, ready: false })
    expect(graph.getNotificationMessageTokenAudienceIds).not.toHaveBeenCalled()
  })

  test("a disconnected Page skips the check and flags only its rows", async () => {
    repository.listByWorkspaceId.mockResolvedValue([
      row({ id: "r1", customAudienceId: "aud_1", pageId: "page_gone" }),
      row({ id: "r2", customAudienceId: "aud_2", pageId: "page_1" }),
    ])
    graph.getMarketingMessagesAudiences.mockResolvedValue([
      meta("aud_1"),
      meta("aud_2"),
    ])
    resolvePageToken.mockImplementation((pageId: string) =>
      Promise.resolve(
        pageId === "page_1" ? { accessToken: "PAGE_TOKEN" } : null,
      ),
    )
    const result = await service.getLiveStatus(live())
    expect(result.aud_1).toMatchObject({ pageDisconnected: true, ready: false })
    expect(result.aud_2).toMatchObject({ pageDisconnected: false })
    expect(graph.getNotificationMessageTokenAudienceIds).toHaveBeenCalledTimes(
      1,
    )
  })

  test("a failing token call (revoked Page token) does not break other rows", async () => {
    repository.listByWorkspaceId.mockResolvedValue([
      row({ id: "r1", customAudienceId: "aud_1", pageId: "page_bad" }),
      row({ id: "r2", customAudienceId: "aud_2", pageId: "page_1" }),
    ])
    graph.getMarketingMessagesAudiences.mockResolvedValue([
      meta("aud_1"),
      meta("aud_2"),
    ])
    graph.getNotificationMessageTokenAudienceIds.mockImplementation(
      ({ pageId }: { pageId: string }) =>
        pageId === "page_bad"
          ? Promise.reject(new Error("Invalid OAuth access token"))
          : Promise.resolve(["aud_2"]),
    )
    const result = await service.getLiveStatus(live())
    expect(result.aud_1).toMatchObject({ ready: false, lower: 1000 })
    expect(result.aud_2).toMatchObject({ ready: true })
  })

  test("a failing ad account leaves its rows with null live data, others intact", async () => {
    repository.listByWorkspaceId.mockResolvedValue([
      row({ id: "r1", customAudienceId: "aud_1", adAccountId: "act_bad" }),
      row({ id: "r2", customAudienceId: "aud_2", adAccountId: "act_1" }),
    ])
    graph.getMarketingMessagesAudiences.mockImplementation(
      ({ adAccountId }: { adAccountId: string }) =>
        adAccountId === "act_bad"
          ? Promise.reject(new Error("boom"))
          : Promise.resolve([meta("aud_2")]),
    )
    const result = await service.getLiveStatus(live())
    expect(result.aud_1).toEqual({
      lower: null,
      upper: null,
      deliveryStatus: null,
      ready: false,
      missingOnMeta: false,
      pageDisconnected: false,
    })
    expect(result.aud_2?.lower).toBe(1000)
  })

  test("a throwing resolver does not break other rows or throw", async () => {
    repository.listByWorkspaceId.mockResolvedValue([
      row({ id: "r1", customAudienceId: "aud_1", pageId: "page_bad" }),
      row({ id: "r2", customAudienceId: "aud_2", pageId: "page_1" }),
    ])
    graph.getMarketingMessagesAudiences.mockResolvedValue([
      meta("aud_1"),
      meta("aud_2"),
    ])
    resolvePageToken.mockImplementation((pageId: string) =>
      pageId === "page_bad"
        ? Promise.reject(new Error("resolver boom"))
        : Promise.resolve({ accessToken: "PAGE_TOKEN", version: "v26.0" }),
    )
    graph.getNotificationMessageTokenAudienceIds.mockResolvedValue(["aud_2"])
    const result = await service.getLiveStatus(live())
    expect(result.aud_1).toMatchObject({
      ready: false,
      pageDisconnected: false,
    })
    expect(result.aud_2).toMatchObject({ ready: true })
    expect(graph.getNotificationMessageTokenAudienceIds).toHaveBeenCalledWith(
      expect.objectContaining({ version: "v26.0" }),
    )
  })
})
