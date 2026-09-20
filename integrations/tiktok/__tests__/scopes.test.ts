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
  const requestedScopes = () =>
    (
      new URL(
        generateAuthUrl({
          clientId: "client-key",
          redirectUrl: "https://example.com/integrations/tiktok/callback",
        }),
      ).searchParams.get("scope") ?? ""
    ).split(",")

  // The regression this guards. TikTok answers
  // `error=invalid_scope&error_type=scope` and refuses the WHOLE request over
  // one scope the app is not approved for, so an eager entry here does not
  // weaken comment automation — it stops anyone connecting the channel at all.
  test("asks for nothing the app is not approved for", () => {
    const requested = new Set(requestedScopes())
    for (const scope of TIKTOK_COMMENT_SCOPES_PENDING_APPROVAL) {
      expect(requested.has(scope)).toBe(false)
    }
  })

  test("asks for exactly the approved set", () => {
    expect([...requestedScopes()].sort()).toEqual(
      [
        "comment.list",
        "comment.list.manage",
        "message.list.manage",
        "message.list.read",
        "message.list.send",
        "user.account.type",
        "user.info.basic",
        "user.info.profile",
        "user.info.stats",
        "user.info.username",
        "video.list",
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

  // `video.list` was approved after the comment scopes and moved out of the
  // pending list. It has to stay in the requested set or the Inbox post card
  // silently falls back to the derived link for every connection, forever —
  // there is no error to notice, which is exactly why it is pinned here.
  test("the comment set carries video.list, so the authorize request asks for it", () => {
    expect([...TIKTOK_COMMENT_AUTOMATION_SCOPES]).toContain("video.list")
    expect([...TIKTOK_COMMENT_SCOPES_PENDING_APPROVAL]).toEqual([])
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
  test("a connection holding every required scope is not flagged", () => {
    expect(
      tiktokNeedsReauthorization(
        buildAuth([...TIKTOK_COMMENT_AUTOMATION_SCOPES]),
      ),
    ).toBe(false)
  })

  test("a connection missing a required scope is flagged", () => {
    expect(
      tiktokNeedsReauthorization(buildAuth(["user.info.basic", "video.list"])),
    ).toBe(true)
  })

  // A DM-only connection is legitimate — it is allowed through the callback on
  // purpose — but comment automation still cannot run on it, so the settings
  // list has to say so.
  test("a core-only connection is flagged for comments", () => {
    expect(tiktokNeedsReauthorization(buildAuth([...TIKTOK_CORE_SCOPES]))).toBe(
      true,
    )
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
