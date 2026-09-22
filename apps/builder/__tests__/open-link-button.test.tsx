import type { AppLinkTargets } from "@chatbotx.io/flow-config"
import { resolveDeepLinkNavigation } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"

const targets: AppLinkTargets = {
  androidPackage: "com.zing.zalo",
  androidIntentUrl:
    "intent://zalo.me/g/owfqvp123#Intent;scheme=https;package=com.zing.zalo;end",
  iosUrl: "zalo://g/owfqvp123",
  iosAppStoreId: "579523206",
  webUrl: "https://zalo.me/g/owfqvp123",
}

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36"

describe("resolveDeepLinkNavigation", () => {
  test("never navigates on its own to the https URL", () => {
    // Every destination that reaches the interstitial is one a webview cannot
    // render — that is why its rule is in the table at all. Going there
    // automatically drops the contact on exactly the blank page the detour
    // exists to avoid, so the page holds them instead and offers the button.
    const { href, auto } = resolveDeepLinkNavigation(targets, IPHONE_UA)

    expect(href).toBe(targets.webUrl)
    expect(auto).toBe(false)
  })

  test("never resolves to a custom scheme on iOS", () => {
    // A webview sent to a scheme its host app does not handle renders nothing.
    // `iosUrl` belongs in the `al:ios:url` meta tag, which Messenger resolves
    // natively before any webview opens, and nowhere else.
    expect(resolveDeepLinkNavigation(targets, IPHONE_UA).href).not.toBe(
      targets.iosUrl,
    )
  })

  test("goes straight to the intent URL on Android, which its WebView understands", () => {
    const { href, auto } = resolveDeepLinkNavigation(targets, ANDROID_UA)

    expect(href).toBe(targets.androidIntentUrl)
    expect(auto).toBe(true)
  })

  test("holds on the page when the user agent is unknown", () => {
    const { href, auto } = resolveDeepLinkNavigation(targets, "")

    expect(href).toBe(targets.webUrl)
    expect(auto).toBe(false)
  })
})
