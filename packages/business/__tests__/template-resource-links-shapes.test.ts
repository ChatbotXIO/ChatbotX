// @vitest-environment node

import { normalizeMessengerTokenUrl } from "@chatbotx.io/flow-config"
import { encodeBase62 } from "@chatbotx.io/utils"
import { describe, expect, test, vi } from "vitest"
import { buildLeaderboardWelcomeNode } from "../src/leaderboard/welcome-flow"
import type { TemplateInstallContext } from "../src/template/adapters/types"
import {
  RESOURCE_LINK_PATTERNS,
  rewriteEntryResourceLinks,
  rewriteResourceLinksDeep,
} from "../src/template/resource-links"

const ctxOf = (warn = vi.fn()) =>
  ({
    workspaceId: "200",
    sourceWorkspaceId: "100",
    idMaps: {
      miniApp: new Map([["14", "24"]]),
      minigame: new Map([["13", "23"]]),
      leaderboard: new Map([["15", "25"]]),
    },
    magicLinkNameBindings: new Map<string, string>(),
    warn,
  }) as unknown as TemplateInstallContext

describe("link shapes the flows actually store", () => {
  test("the normalised ({{1}}) URL of a Messenger template button is rewritten", () => {
    const normalised = normalizeMessengerTokenUrl(
      "https://x.io/mini-apps?id=14&token={{mini_app_token}}",
    )
    expect(normalised?.url).toBe("https://x.io/mini-apps?id=14&token={{1}}")
    const [entry] = rewriteEntryResourceLinks(ctxOf(), "flows", [
      {
        sourceId: "f1",
        components: [{ type: "BUTTONS", buttons: [{ url: normalised?.url }] }],
      },
    ])
    expect(entry?.components[0]?.buttons[0]?.url).toBe(
      "https://x.io/mini-apps?id=24&token={{1}}",
    )

    const minigame = normalizeMessengerTokenUrl(
      "https://x.io/minigames?minigameId=13&token={{minigame_play_token}}",
    )
    expect(
      rewriteResourceLinksDeep(minigame?.url, {
        sourceWorkspaceId: "100",
        targetWorkspaceId: "200",
        idMaps: ctxOf().idMaps,
        magicLinkNameBindings: new Map(),
      }),
    ).toBe("https://x.io/minigames?minigameId=23&token={{1}}")
  })

  test("the leaderboard welcome flow's button link is rewritten", () => {
    const node = buildLeaderboardWelcomeNode({
      text: "Hi",
      buttonLabel: "View",
      viewUrl:
        "https://x.io/leaderboards?leaderboardId=15&token={{leaderboard_view_token}}",
    })
    const [rewritten] = rewriteEntryResourceLinks(ctxOf(), "flows", [
      { sourceId: "f1", node },
    ])
    const url = JSON.stringify(rewritten)
    expect(url).toContain(
      "leaderboards?leaderboardId=25&token={{leaderboard_view_token}}",
    )
    expect(url).not.toContain("leaderboardId=15")
  })

  test("unknown links are untouched and an unmapped tool is reported", () => {
    const warn = vi.fn()
    const text = "https://example.com/page?id=14 and https://x.io/other?x=1"
    const [entry] = rewriteEntryResourceLinks(ctxOf(warn), "flows", [
      { sourceId: "f1", text },
    ])
    expect(entry?.text).toBe(text)
    expect(warn).not.toHaveBeenCalled()

    const [missing] = rewriteEntryResourceLinks(ctxOf(warn), "flows", [
      { sourceId: "f2", text: "https://x.io/mini-apps?id=99&token=a" },
    ])
    expect(missing?.text).toBe("https://x.io/mini-apps?id=99&token=a")
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ entityKind: "linkNotRemapped" }),
    )
  })

  test("mg_/lb_ runtime payloads carry contact ids and no pattern matches or rewrites them", () => {
    const mg = `mg_${encodeBase62("13")}_${encodeBase62("555")}`
    const lb = `lb_${encodeBase62("15")}_${encodeBase62("555")}`
    for (const pattern of RESOURCE_LINK_PATTERNS) {
      for (const payload of [mg, lb, `https://m.me/page?ref=${mg}`]) {
        expect(payload.match(new RegExp(pattern.match.source, "g"))).toBeNull()
      }
    }
    const warn = vi.fn()
    const [entry] = rewriteEntryResourceLinks(ctxOf(warn), "flows", [
      { sourceId: "f1", text: `m.me/page?ref=${mg} ${lb}` },
    ])
    expect(entry?.text).toBe(`m.me/page?ref=${mg} ${lb}`)
    expect(warn).not.toHaveBeenCalled()
  })
})
