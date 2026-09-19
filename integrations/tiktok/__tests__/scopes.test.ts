import { describe, expect, test } from "vitest"
import { generateAuthUrl } from "../src/apis/auth"
import {
  findMissingTiktokScopes,
  parseTiktokScopes,
  TIKTOK_COMMENT_AUTOMATION_SCOPES,
  TIKTOK_COMMENT_SCOPES_PENDING_APPROVAL,
  TIKTOK_CORE_SCOPES,
  TIKTOK_OPTIONAL_PROFILE_SCOPES,
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

describe("the authorize request", () => {
  const requestedScopes = () => {
    const url = new URL(
      generateAuthUrl({
        clientId: "client-key",
        redirectUrl: "https://example.com/integrations/tiktok/callback",
      }),
    )
    return (url.searchParams.get("scope") ?? "").split(",")
  }

  // The regression this guards: adding these two took the channel down.
  // TikTok answers `error=invalid_scope&error_type=scope` and refuses the
  // WHOLE request when the app is not approved for one of them, so a workspace
  // that only wanted DMs could no longer connect either. They go back in only
  // together with the portal approval.
  test("asks for no scope the app is not approved for", () => {
    const requested = new Set(requestedScopes())
    for (const scope of TIKTOK_COMMENT_SCOPES_PENDING_APPROVAL) {
      expect(requested.has(scope)).toBe(false)
    }
  })

  // Pinned against the set that is known to work in production, so a refactor
  // of the groups cannot quietly drop or add one.
  test("asks for exactly the scopes the channel is approved for", () => {
    expect([...requestedScopes()].sort()).toEqual(
      [
        "message.list.manage",
        "message.list.read",
        "message.list.send",
        "user.account.type",
        "user.info.basic",
        "user.info.profile",
        "user.info.stats",
        "user.info.username",
      ].sort(),
    )
  })
})

describe("scope groups", () => {
  // The split is the whole safety argument: refusing a connect over a scope
  // nothing reads would turn a cosmetic choice on TikTok's consent screen into
  // a hard failure. `getUserInfo` asks only for
  // `open_id,display_name,avatar_url,username`, so nothing behind the optional
  // profile scopes is ever read.
  test("core holds only what the product actually reads", () => {
    expect([...TIKTOK_CORE_SCOPES]).toEqual([
      "user.info.basic",
      "user.info.username",
      "message.list.read",
      "message.list.send",
      "message.list.manage",
    ])
  })

  test("the three groups do not overlap", () => {
    const all = [
      ...TIKTOK_CORE_SCOPES,
      ...TIKTOK_OPTIONAL_PROFILE_SCOPES,
      ...TIKTOK_COMMENT_AUTOMATION_SCOPES,
    ]
    expect(new Set(all).size).toBe(all.length)
  })
})

describe("findMissingTiktokScopes", () => {
  test("names what the grant does not contain, in declaration order", () => {
    expect(
      findMissingTiktokScopes(["user.info.basic"], TIKTOK_CORE_SCOPES),
    ).toEqual([
      "user.info.username",
      "message.list.read",
      "message.list.send",
      "message.list.manage",
    ])
  })

  test("a full grant is missing nothing", () => {
    expect(
      findMissingTiktokScopes(TIKTOK_CORE_SCOPES, TIKTOK_CORE_SCOPES),
    ).toEqual([])
  })

  test("extra granted scopes are not a problem", () => {
    expect(
      findMissingTiktokScopes(
        [...TIKTOK_CORE_SCOPES, "something.else"],
        TIKTOK_CORE_SCOPES,
      ),
    ).toEqual([])
  })

  // The split that lets a DM-only workspace connect: withholding the comment
  // scopes must leave the core set intact, so the callback has no reason to
  // refuse the connection.
  test("a grant of core scopes alone satisfies core but not comments", () => {
    expect(
      findMissingTiktokScopes(TIKTOK_CORE_SCOPES, TIKTOK_CORE_SCOPES),
    ).toEqual([])
    expect(
      findMissingTiktokScopes(
        TIKTOK_CORE_SCOPES,
        TIKTOK_COMMENT_AUTOMATION_SCOPES,
      ),
    ).toEqual([...TIKTOK_COMMENT_AUTOMATION_SCOPES])
  })
})

describe("tiktokNeedsReauthorization", () => {
  // While no comment scope is requested, nothing can be missing one. Flagging
  // here would put a permanent warning on every row that re-authorizing could
  // not clear, because the authorize request never asks for the permission the
  // warning is about.
  test.each([
    ["a full grant", [...TIKTOK_CORE_SCOPES]],
    ["a partial grant", ["user.info.basic"]],
    ["an empty recorded list", []],
  ])("does not flag %s while comment scopes are unrequested", (_label, scopes) => {
    expect(tiktokNeedsReauthorization(buildAuth(scopes))).toBe(false)
  })

  test("does not flag a connection with no recorded scopes either", () => {
    expect(tiktokNeedsReauthorization(buildAuth())).toBe(false)
  })
})
