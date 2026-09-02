import { describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// messagingAdOperationRepository — the durable operation record backing the
// in-app messaging-ads manager. Mocks `db` at the module boundary so the
// insert/update shapes are asserted without touching a real database.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  insert: vi.fn(),
  update: vi.fn(),
  select: vi.fn(),
}))

vi.mock("../src/client", () => ({
  and: mocks.and,
  db: {
    insert: mocks.insert,
    update: mocks.update,
    select: mocks.select,
  },
  eq: mocks.eq,
}))

vi.mock("../src/schema", () => ({
  messagingAdOperationModel: {
    id: "id",
    workspaceId: "workspaceId",
  },
}))

const { messagingAdOperationRepository } = await import(
  "../src/repositories/messaging-ad-operation/repository"
)

function chain(finalResult: unknown[]) {
  const builder = {
    values: vi.fn(() => builder),
    set: vi.fn(() => builder),
    where: vi.fn(() => builder),
    returning: vi.fn(() => Promise.resolve(finalResult)),
  }
  return builder
}

describe("messagingAdOperationRepository.create", () => {
  test("inserts the caller-supplied operationId and the input snapshot", async () => {
    const row = { id: "op_1", workspaceId: "ws_1" }
    const builder = chain([row])
    mocks.insert.mockReturnValue(builder)

    const result = await messagingAdOperationRepository.create({
      id: "op_1",
      workspaceId: "ws_1",
      channel: "whatsapp",
      integrationWhatsappId: "iw_1",
      adAccountId: "act_9",
      name: "My ad",
      input: {
        adAccountId: "act_9",
        campaign: { name: "My ad", specialAdCategories: ["NONE"] },
        adSet: {
          dailyBudgetMinorUnits: 2000,
          targeting: { countries: ["US"] },
        },
        creative: {
          media: { kind: "image", imageHash: "hash", link: "https://x.com" },
          welcomeMessage: { type: "default" },
        },
      },
    })

    expect(result).toEqual(row)
    expect(builder.values).toHaveBeenCalledWith(
      expect.objectContaining({ id: "op_1", workspaceId: "ws_1" }),
    )
  })

  test("throws when the insert returns no row", async () => {
    const builder = chain([])
    mocks.insert.mockReturnValue(builder)

    await expect(
      messagingAdOperationRepository.create({
        id: "op_1",
        workspaceId: "ws_1",
        channel: "messenger",
        integrationMessengerId: "im_1",
        adAccountId: "act_9",
        name: "My ad",
        input: {
          adAccountId: "act_9",
          campaign: { name: "My ad", specialAdCategories: ["NONE"] },
          adSet: {
            dailyBudgetMinorUnits: 2000,
            targeting: { countries: ["US"] },
          },
          creative: {
            media: { kind: "image", imageHash: "hash", link: "https://x.com" },
            welcomeMessage: { type: "default" },
          },
        },
      }),
    ).rejects.toThrow()
  })
})

describe("messagingAdOperationRepository.updateCreateProgress", () => {
  test("only sets the meta ids that are provided", async () => {
    const row = { id: "op_1", createState: "campaignCreated" }
    const builder = chain([row])
    mocks.update.mockReturnValue(builder)

    await messagingAdOperationRepository.updateCreateProgress({
      id: "op_1",
      workspaceId: "ws_1",
      createState: "campaignCreated",
      metaCampaignId: "camp_1",
    })

    expect(builder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        createState: "campaignCreated",
        metaCampaignId: "camp_1",
      }),
    )
    const setArg = builder.set.mock.calls[0]?.[0] as Record<string, unknown>
    expect(setArg).not.toHaveProperty("metaAdSetId")
    expect(setArg).not.toHaveProperty("metaAdId")
  })
})
