import { beforeEach, describe, expect, test, vi } from "vitest"

const { findMock } = vi.hoisted(() => ({
  findMock: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn((...conditions: unknown[]) => ({ conditions })),
  asc: vi.fn((field: unknown) => ({ field, dir: "asc" })),
  count: vi.fn(() => "count"),
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(async () => Promise.resolve([{ value: 0 }])),
        })),
      })),
    })),
  },
  desc: vi.fn((field: unknown) => ({ field, dir: "desc" })),
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  ilike: vi.fn(),
  lt: vi.fn(),
  sql: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactModel: { id: "id", fullName: "fullName" },
  conversationModel: { id: "id" },
  minigameContactModel: { id: "id", minigameId: "minigameId" },
  minigameModel: { id: "id", workspaceId: "workspaceId" },
  minigamePlayModel: { id: "id", createdAt: "createdAt" },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: vi.fn(),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: {},
  chatQueue: { add: vi.fn() },
  IntegrationJobAction: {},
  integrationQueue: { add: vi.fn() },
}))

vi.mock("../src/contact-custom-field/service", () => ({
  contactCustomFieldService: {},
}))

vi.mock("../src/contact-inbox/service", () => ({
  contactInboxService: {},
}))

vi.mock("../src/conversation/service", () => ({
  conversationService: {},
}))

vi.mock("../src/tag/service", () => ({
  tagService: {},
}))

vi.mock("../src/minigame/service", () => ({
  minigameService: { find: findMock },
}))

describe("MinigameContactService — indirect tenancy guard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("listPlays rejects a minigameId belonging to another workspace before reading any play rows", async () => {
    findMock.mockRejectedValueOnce(new Error("Minigame not found"))

    const { minigameContactService } = await import(
      "../src/minigame/minigame-contact-service"
    )

    await expect(
      minigameContactService.listPlays({
        workspaceId: "ws-1",
        minigameId: "foreign-minigame",
        contactId: "contact-1",
      }),
    ).rejects.toThrow("Minigame not found")

    expect(findMock).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "foreign-minigame",
    })
  })

  test("listPlayers (list) rejects a minigameId belonging to another workspace before reading any player rows", async () => {
    findMock.mockRejectedValueOnce(new Error("Minigame not found"))

    const { minigameContactService } = await import(
      "../src/minigame/minigame-contact-service"
    )

    await expect(
      minigameContactService.list({
        workspaceId: "ws-1",
        minigameId: "foreign-minigame",
      }),
    ).rejects.toThrow("Minigame not found")

    expect(findMock).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "foreign-minigame",
    })
  })
})
