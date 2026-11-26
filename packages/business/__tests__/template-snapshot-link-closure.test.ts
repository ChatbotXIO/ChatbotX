// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  collectMagicLinks: vi.fn(),
  collectMinigames: vi.fn(),
  findMagicLinks: vi.fn(),
  findPolls: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      magicLinkModel: { findMany: mocks.findMagicLinks },
      pollModel: { findMany: mocks.findPolls },
    },
  },
}))
vi.mock("../src/template/adapters/registry", () => ({
  templateAdapterRegistry: {
    magicLinks: { collector: { collect: mocks.collectMagicLinks } },
    minigames: { collector: { collect: mocks.collectMinigames } },
  },
}))

const { collectSnapshotClosure } = await import(
  "../src/template/snapshot-collect"
)

const empty = { entries: [], hardDependencies: [] }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findMagicLinks.mockResolvedValue([])
  mocks.findPolls.mockResolvedValue([])
  mocks.collectMinigames.mockResolvedValue(empty)
})

describe("collectSnapshotClosure: links between tools", () => {
  test("a magic link whose destination is a minigame pulls that minigame in", async () => {
    mocks.collectMagicLinks.mockResolvedValue({
      ...empty,
      entries: [
        {
          sourceId: "7",
          name: "promo",
          url: "https://x.io/minigames?minigameId=55&token={{minigame_play_token}}",
        },
      ],
    })
    const idsByCategory = { magicLinks: ["7"], minigames: [] as string[] }

    await collectSnapshotClosure(
      "100",
      idsByCategory as unknown as Parameters<typeof collectSnapshotClosure>[1],
    )

    expect(idsByCategory.minigames).toEqual(["55"])
    expect(mocks.collectMinigames).toHaveBeenLastCalledWith("100", ["55"])
  })
})
