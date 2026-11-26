// @vitest-environment node

import { encodeBase62 } from "@chatbotx.io/utils"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
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

const { collectLinkedToolDependencies } = await import(
  "../src/template/link-dependencies"
)

const WS = "100"

describe("collectLinkedToolDependencies", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findMagicLinks.mockResolvedValue([{ id: "7" }])
    mocks.findPolls.mockResolvedValue([{ id: "12" }])
  })

  test("a magic-link URL and both poll forms pull their tool, resolved in the source workspace in one query each", async () => {
    const dependencies = await collectLinkedToolDependencies(WS, {
      nodes: [
        "https://x.io/r/100/promo",
        "https://x.io/l/100/p/12",
        `payload pl_${encodeBase62("12")}`,
      ],
    })

    expect(dependencies).toEqual([
      { category: "magicLinks", sourceId: "7" },
      { category: "polls", sourceId: "12" },
    ])
    expect(mocks.findMagicLinks).toHaveBeenCalledTimes(1)
    expect(mocks.findMagicLinks).toHaveBeenCalledWith({
      where: { workspaceId: WS, name: { in: ["promo"] } },
      columns: { id: true },
    })
    expect(mocks.findPolls).toHaveBeenCalledTimes(1)
    expect(mocks.findPolls.mock.calls[0][0].where).toEqual({
      workspaceId: WS,
      id: { in: ["12"] },
    })
  })

  test("a link to another workspace queries nothing and pulls nothing", async () => {
    const dependencies = await collectLinkedToolDependencies(WS, [
      "https://x.io/r/999/promo",
      "https://x.io/l/999/p/12",
    ])

    expect(dependencies).toEqual([])
    expect(mocks.findMagicLinks).not.toHaveBeenCalled()
    expect(mocks.findPolls).not.toHaveBeenCalled()
  })

  test("an unknown magic-link name or poll id pulls nothing", async () => {
    mocks.findMagicLinks.mockResolvedValue([])
    mocks.findPolls.mockResolvedValue([])

    expect(
      await collectLinkedToolDependencies(
        WS,
        "https://x.io/r/100/nope https://x.io/l/100/p/55 pl_zzz",
      ),
    ).toEqual([])
  })

  test("an ordinary word that looks like a huge poll payload is ignored instead of failing the lookup", async () => {
    const dependencies = await collectLinkedToolDependencies(WS, {
      text: "utm pl_JanuaryNewsletter2025 and /l/100/p/99999999999999999999999",
    })

    expect(dependencies).toEqual([])
    expect(mocks.findPolls).not.toHaveBeenCalled()
  })
})
