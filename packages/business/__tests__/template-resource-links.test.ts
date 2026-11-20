// @vitest-environment node

import { encodeBase62 } from "@chatbotx.io/utils"
import { describe, expect, test, vi } from "vitest"
import {
  collectResourceLinkDependencies,
  rewriteResourceLinksDeep,
} from "../src/template/resource-links"

const context = {
  sourceWorkspaceId: "100",
  targetWorkspaceId: "200",
  idMaps: {
    dynamicImage: new Map([["11", "21"]]),
    poll: new Map([["12", "22"]]),
    minigame: new Map([["13", "23"]]),
    miniApp: new Map([["14", "24"]]),
    leaderboard: new Map([["15", "25"]]),
  },
  magicLinkNameBindings: new Map([["promo", "promo-copy"]]),
}

describe("rewriteResourceLinksDeep", () => {
  test("a magic link follows the target workspace and the copy's name, keeping the origin and query", () => {
    const rewritten = rewriteResourceLinksDeep(
      { text: "Go https://app.example.com/r/100/promo?utm=a" },
      context,
    )
    expect(rewritten.text).toBe(
      "Go https://app.example.com/r/200/promo-copy?utm=a",
    )
  })

  test("a dynamic image link keeps its userId token", () => {
    const rewritten = rewriteResourceLinksDeep(
      "https://x.io/dynamic-images?dynamicImageId=11&userId={{user_id}}",
      context,
    )
    expect(rewritten).toBe(
      "https://x.io/dynamic-images?dynamicImageId=21&userId={{user_id}}",
    )
  })

  test("a poll link and its channel payload both point at the copied poll", () => {
    expect(rewriteResourceLinksDeep("https://x.io/l/100/p/12", context)).toBe(
      "https://x.io/l/200/p/22",
    )
    expect(
      rewriteResourceLinksDeep(
        `m.me/page?ref=pl_${encodeBase62("12")}`,
        context,
      ),
    ).toBe(`m.me/page?ref=pl_${encodeBase62("22")}`)
  })

  test("minigame, mini app and leaderboard links keep their token parameters", () => {
    expect(
      rewriteResourceLinksDeep(
        "https://x.io/minigames?minigameId=13&token={{minigame_play_token}} https://x.io/mini-apps?id=14&token={{mini_app_token}} https://x.io/leaderboards?leaderboardId=15&token={{leaderboard_view_token}}",
        context,
      ),
    ).toBe(
      "https://x.io/minigames?minigameId=23&token={{minigame_play_token}} https://x.io/mini-apps?id=24&token={{mini_app_token}} https://x.io/leaderboards?leaderboardId=25&token={{leaderboard_view_token}}",
    )
  })

  test("a link to a tool that did not come along is left as written and reported", () => {
    const unresolved = vi.fn()
    const text =
      "https://x.io/r/100/other and https://x.io/dynamic-images?dynamicImageId=99"
    expect(rewriteResourceLinksDeep(text, context, unresolved)).toBe(text)
    expect(unresolved).toHaveBeenCalledTimes(2)
  })

  test("a link of another workspace, or plain text, is never touched", () => {
    const unresolved = vi.fn()
    const text = "https://x.io/r/999/promo and https://x.io/l/999/p/12 and pl_"
    expect(rewriteResourceLinksDeep(text, context, unresolved)).toBe(text)
    expect(unresolved).not.toHaveBeenCalled()
  })

  test("only strings are rewritten, at any depth", () => {
    const value = { a: [{ b: "https://x.io/r/100/promo" }], n: 5 }
    expect(rewriteResourceLinksDeep(value, context)).toEqual({
      a: [{ b: "https://x.io/r/200/promo-copy" }],
      n: 5,
    })
  })
})

describe("collectResourceLinkDependencies", () => {
  test("a dynamic image link pulls that tool in, once, at any depth", () => {
    const dependencies = collectResourceLinkDependencies({
      a: [
        "https://x.io/dynamic-images?dynamicImageId=11",
        "https://x.io/dynamic-images?dynamicImageId=11",
      ],
      b: {
        c: "https://x.io/dynamic-images?dynamicImageId=11&userId={{user_id}}",
      },
    })
    expect(dependencies).toEqual([
      { category: "dynamicImages", sourceId: "11" },
    ])
    expect(
      collectResourceLinkDependencies(
        "https://x.io/minigames?minigameId=13 https://x.io/leaderboards?leaderboardId=15 https://x.io/mini-apps?id=14",
      ),
    ).toEqual([
      { category: "minigames", sourceId: "13" },
      { category: "miniApps", sourceId: "14" },
      { category: "leaderboards", sourceId: "15" },
    ])
  })

  test("an id past the bigint range is ignored, and one scan is capped", () => {
    expect(
      collectResourceLinkDependencies(
        "minigames?minigameId=9223372036854775808 mini-apps?id=99999999999999999999 mini-apps?id=14",
      ),
    ).toEqual([{ category: "miniApps", sourceId: "14" }])
    const flood = Array.from(
      { length: 2000 },
      (_, index) => `mini-apps?id=${index + 1}`,
    ).join(" ")
    expect(collectResourceLinkDependencies(flood)).toHaveLength(500)
  })

  test("plain text, polls and magic links (resolved against the database) add nothing here", () => {
    expect(
      collectResourceLinkDependencies(
        "see https://x.io/r/100/promo, https://x.io/l/100/p/12 and pl_abc",
      ),
    ).toEqual([])
  })
})
