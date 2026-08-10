import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  where: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
}))

// Mocked Drizzle helpers keep enough structure for the assertions below to
// inspect which columns/values the query was built from.
const mockSql = (strings: TemplateStringsArray, ...values: unknown[]) => ({
  fragment: strings.join("?"),
  values,
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: { select: mocks.select },
  and: (...conditions: unknown[]) => ({
    and: conditions.filter((condition) => condition !== undefined),
  }),
  eq: (column: unknown, value: unknown) => ({ eq: [column, value] }),
  sql: mockSql,
  findOrFail: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationInstagramModel: {
    id: "IntegrationInstagram.id",
    auth: "IntegrationInstagram.auth",
    pageId: "IntegrationInstagram.pageId",
  },
  integrationMessengerModel: {
    id: "IntegrationMessenger.id",
    auth: "IntegrationMessenger.auth",
    pageId: "IntegrationMessenger.pageId",
  },
}))

const whereCondition = () => JSON.stringify(mocks.where.mock.calls[0]?.[0])

describe("Meta sibling integration service helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.limit.mockResolvedValue([])
    mocks.where.mockReturnValue({ limit: mocks.limit })
    mocks.from.mockReturnValue({ where: mocks.where })
    mocks.select.mockReturnValue({ from: mocks.from })
  })

  test("messengerIntegrationExistsForPage returns true when a row is found", async () => {
    const { messengerIntegrationService } = await import(
      "../src/integration-messenger/service"
    )
    mocks.limit.mockResolvedValueOnce([{ id: "messenger-1" }])

    await expect(
      messengerIntegrationService.existsForPage({
        pageId: "page-1",
        clientId: "client-1",
      }),
    ).resolves.toBe(true)

    expect(whereCondition()).toContain("page-1")
    expect(whereCondition()).toContain("client-1")
  })

  test("instagramIntegrationExistsForPage filters by page id and client id", async () => {
    const { instagramIntegrationService } = await import(
      "../src/integration-instagram/service"
    )

    await expect(
      instagramIntegrationService.existsForPage({
        pageId: "page-2",
        clientId: "client-2",
      }),
    ).resolves.toBe(false)

    expect(whereCondition()).toContain("page-2")
    expect(whereCondition()).toContain("client-2")
  })

  test("instagramIntegrationExistsByPageId omits the client id filter", async () => {
    const { instagramIntegrationService } = await import(
      "../src/integration-instagram/service"
    )

    await instagramIntegrationService.existsByPageId("page-3")

    const condition = mocks.where.mock.calls[0]?.[0] as { and: unknown[] }
    expect(JSON.stringify(condition)).toContain("page-3")
    expect(JSON.stringify(condition)).not.toContain("clientId")
    // undefined clientId filter is dropped, leaving only the page id equality.
    expect(condition.and).toHaveLength(1)
  })
})
