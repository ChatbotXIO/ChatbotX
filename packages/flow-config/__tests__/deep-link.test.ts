import { describe, expect, test } from "vitest"
import {
  buildAppLinkTargets,
  DEEP_LINK_APPS,
  matchDeepLinkApp,
} from "../src/deep-link"

describe("matchDeepLinkApp", () => {
  test("a Zalo group invite resolves to the group rule, not the generic one", () => {
    // Table order is the only thing separating these two, and getting it wrong
    // silently relabels every group invite.
    expect(matchDeepLinkApp("https://zalo.me/g/owfqvp123")?.id).toBe(
      "zaloGroup",
    )
    expect(matchDeepLinkApp("https://www.zalo.me/g/owfqvp123")?.id).toBe(
      "zaloGroup",
    )
    expect(matchDeepLinkApp("https://zalo.me/pagename")?.id).toBe("zalo")
  })

  test("the table holds Zalo and m.me, and nothing else", () => {
    // Every other destination keeps going straight to where it always went.
    // `facebook.com` / `instagram.com` were in here and were removed: the
    // detour added a hop and opened nothing.
    expect(DEEP_LINK_APPS.map((app) => app.id)).toEqual([
      "zaloGroup",
      "zalo",
      "messenger",
    ])
    expect(matchDeepLinkApp("https://m.me/9679565075442614")?.id).toBe(
      "messenger",
    )
    expect(
      matchDeepLinkApp("https://www.facebook.com/share/g/1FhUw8ij8B/"),
    ).toBeUndefined()
    expect(matchDeepLinkApp("https://instagram.com/someone")).toBeUndefined()
    expect(matchDeepLinkApp("https://t.me/somechannel")).toBeUndefined()
    expect(matchDeepLinkApp("https://vt.tiktok.com/ZS123/")).toBeUndefined()
    expect(matchDeepLinkApp("https://chat.whatsapp.com/ABC")).toBeUndefined()
  })

  test("m.me carries no channel, so it is not exempt on Messenger", () => {
    // The self-channel exemption assumes a link opened from inside its own app
    // already works. For `m.me` in Messenger's iOS webview that is precisely
    // the assumption that fails, so declaring a channel here would exempt the
    // one case the rule exists for.
    expect(
      matchDeepLinkApp("https://m.me/9679565075442614")?.channel,
    ).toBeUndefined()
  })

  test("host matching is by whole label, not by suffix", () => {
    expect(matchDeepLinkApp("https://notzalo.me/g/abc")).toBeUndefined()
    expect(matchDeepLinkApp("https://zalo.me.evil.test/g/abc")).toBeUndefined()
  })

  test("unknown and non-http destinations do not match", () => {
    expect(matchDeepLinkApp("https://example.com/page")).toBeUndefined()
    expect(matchDeepLinkApp("javascript:alert(1)")).toBeUndefined()
    expect(matchDeepLinkApp("data:text/html,<p>x</p>")).toBeUndefined()
    expect(matchDeepLinkApp("not a url")).toBeUndefined()
    expect(matchDeepLinkApp("")).toBeUndefined()
  })

  test("every rule declares an app name and an android package", () => {
    for (const app of DEEP_LINK_APPS) {
      expect(app.appName).toBeTruthy()
      expect(app.android.package).toBeTruthy()
    }
  })
})

describe("buildAppLinkTargets", () => {
  const url = "https://zalo.me/g/owfqvp123?ref=1"
  // biome-ignore lint/style/noNonNullAssertion: the suite above proves it matches
  const app = matchDeepLinkApp(url)!

  test("keeps the original https URL as the web target", () => {
    expect(buildAppLinkTargets(url, app).webUrl).toBe(url)
  })

  test("builds an android intent URL with an encoded browser fallback", () => {
    const { androidIntentUrl } = buildAppLinkTargets(url, app)

    expect(androidIntentUrl).toBe(
      `intent://zalo.me/g/owfqvp123?ref=1#Intent;scheme=https;package=com.zing.zalo;S.browser_fallback_url=${encodeURIComponent(url)};end`,
    )
  })

  test("normalises the intent host the same way the rule was matched", () => {
    // `matchDeepLinkApp` decided the app handles `zalo.me`. Emitting
    // `intent://www.zalo.me/…` when the app's manifest declares no `www.` host
    // filter resolves no activity, and Android drops silently to the browser
    // fallback — the app never opens.
    const wwwUrl = "https://www.zalo.me/g/owfqvp123"
    // biome-ignore lint/style/noNonNullAssertion: the suite above proves it matches
    const wwwApp = matchDeepLinkApp(wwwUrl)!

    const { androidIntentUrl } = buildAppLinkTargets(wwwUrl, wwwApp)

    expect(androidIntentUrl).toContain("intent://zalo.me/g/owfqvp123")
    // The fallback is the real web address, so it keeps the host as written.
    expect(androidIntentUrl).toContain(
      `S.browser_fallback_url=${encodeURIComponent(wwwUrl)}`,
    )
  })

  test("emits no iOS target for a rule with no verified scheme", () => {
    // `al:ios:url` must be a custom scheme, never an https URL — an https value
    // there is what sent iPhone users straight back to a blank browser page.
    // Until a scheme is verified on a device, no iOS tags is the correct output.
    expect(app.ios?.scheme).toBeUndefined()

    const targets = buildAppLinkTargets(url, app)
    expect(targets.iosUrl).toBeUndefined()
    // Pointless without its required other half, so it is withheld too.
    expect(targets.iosAppStoreId).toBeUndefined()
  })

  test("maps an m.me thread to Messenger's own scheme", () => {
    const mMe = "https://m.me/9679565075442614"
    // biome-ignore lint/style/noNonNullAssertion: asserted in the suite above
    const messenger = matchDeepLinkApp(mMe)!

    const targets = buildAppLinkTargets(mMe, messenger)

    expect(targets.iosUrl).toBe("fb-messenger://user-thread/9679565075442614")
    expect(targets.iosAppStoreId).toBe("454638411")
  })

  test("leaves an m.me recurring-notification link on https", () => {
    // `m.me/rn/<page>` is an opt-in surface, not a thread — there is nothing
    // for `user-thread/` to point at.
    const rn = "https://m.me/rn/OriginalCoastClothing?topic=deals"
    // biome-ignore lint/style/noNonNullAssertion: asserted in the suite above
    const messenger = matchDeepLinkApp(rn)!

    const targets = buildAppLinkTargets(rn, messenger)

    expect(targets.iosUrl).toBeUndefined()
    expect(targets.iosAppStoreId).toBeUndefined()
  })

  test("carries the iOS pair once a rule declares a scheme", () => {
    const targets = buildAppLinkTargets(url, {
      ...app,
      ios: { appStoreId: "579523206", scheme: (u) => `zalo:/${u.pathname}` },
    })

    expect(targets.iosUrl).toBe("zalo://g/owfqvp123")
    expect(targets.iosAppStoreId).toBe("579523206")
  })
})
