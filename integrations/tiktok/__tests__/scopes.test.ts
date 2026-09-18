import { describe, expect, test } from "vitest"
import {
  parseTiktokScopes,
  TIKTOK_COMMENT_AUTOMATION_SCOPES,
  tiktokNeedsReauthorization,
} from "../src/lib/scopes"

const buildAuth = (scopes?: string[]) => ({
  metadata: {
    openId: "open-1",
    username: "acme",
    displayName: "Acme",
    ...(scopes ? { scopes } : {}),
  },
})

describe("parseTiktokScopes", () => {
  test("splits the comma-separated string TikTok returns", () => {
    expect(
      parseTiktokScopes("user.info.basic,comment.list,video.list"),
    ).toEqual(["user.info.basic", "comment.list", "video.list"])
  })

  test("tolerates padding and empty entries", () => {
    expect(parseTiktokScopes(" comment.list , ,video.list ")).toEqual([
      "comment.list",
      "video.list",
    ])
  })

  test("treats a missing scope string as no scopes", () => {
    expect(parseTiktokScopes(undefined)).toEqual([])
  })
})

describe("tiktokNeedsReauthorization", () => {
  test("a connection holding every required scope is not flagged", () => {
    expect(
      tiktokNeedsReauthorization(
        buildAuth([...TIKTOK_COMMENT_AUTOMATION_SCOPES, "video.list"]),
      ),
    ).toBe(false)
  })

  test("a connection missing a required scope is flagged", () => {
    expect(
      tiktokNeedsReauthorization(buildAuth(["user.info.basic", "video.list"])),
    ).toBe(true)
  })

  // The population this exists for: every account connected before comment
  // automation shipped carries no recorded scopes at all. Unknown must read as
  // "needs re-authorization", or the accounts that silently receive no comment
  // events are exactly the ones the UI stays quiet about.
  test("a connection with no recorded scopes is flagged", () => {
    expect(tiktokNeedsReauthorization(buildAuth())).toBe(true)
  })

  test("an empty recorded scope list is flagged", () => {
    expect(tiktokNeedsReauthorization(buildAuth([]))).toBe(true)
  })
})
