import type { ChannelType } from "@chatbotx.io/utils/channel"

/**
 * Links a Meta in-app webview cannot follow, and the native app each belongs to.
 *
 * Messenger's `web_url` button always opens its own webview — the Send API has
 * no "open in the system browser" option. A destination like
 * `https://zalo.me/g/<id>` is only a shim that hands off to the `zalo://`
 * scheme, which the webview blocks, so the contact is left on a blank page. The
 * escape hatch Meta documents is App Links: a page carrying `al:*` meta tags
 * makes the button launch the native app instead of the webview. This table is
 * what such a page is built from.
 *
 * Membership is deliberately narrow: a destination earns a place here only once
 * the detour has been shown to help it on a real device. Meta's own domains
 * (`m.me`, `facebook.com`, `instagram.com`) were tried and removed — Messenger's
 * webview already handles its own family's domains, so the interstitial added a
 * hop without opening anything, and `m.me` on iPhone got worse. Nothing outside
 * this table is touched at all.
 *
 * Deliberately free of crypto and of any node-only import, so the worker and
 * the builder's public interstitial can share one copy.
 */
export const deepLinkAppIds = ["zaloGroup", "zalo", "messenger"] as const

export type DeepLinkAppId = (typeof deepLinkAppIds)[number]

export type DeepLinkApp = {
  id: DeepLinkAppId
  /** Hostnames, lowercase and without a leading `www.`. */
  hosts: readonly string[]
  /**
   * Narrows the rule to some paths only, so a more specific button label can
   * win — `zalo.me/g/<id>` is a group invite, every other `zalo.me` path is not.
   */
  pathPattern?: RegExp
  /** Brand name, used in the App Links `app_name` tags. Never translated. */
  appName: string
  /**
   * The channel this app *is*. A link is never wrapped when it is sent through
   * its own channel: a Zalo link opened from inside Zalo already works, and the
   * detour would only add a hop.
   */
  channel?: ChannelType
  /**
   * Android needs only the package. Per the App Links spec `al:android:url` is
   * optional, and when absent the navigating app builds its intent with the
   * target URL as data — which is exactly the behaviour we want.
   */
  android: { package: string }
  /**
   * iOS is the opposite: `al:ios:url` is REQUIRED and must be a **custom
   * scheme**, never an https URL. An https value there sends the contact
   * straight back to a browser — the very blank page this detour exists to
   * avoid, and the reason `m.me` links failed on iPhone.
   *
   * So `scheme` is optional, and when it is absent the page emits no `al:ios:*`
   * tags at all and iOS falls through to the interstitial's button. Omitting
   * beats guessing: a scheme that lands on the app's home screen instead of the
   * linked content strands the contact with no way back to the link. Fill one
   * in only after verifying it on a real device.
   */
  ios?: {
    appStoreId: string
    /** May return `undefined` for a path this app has no thread/content for. */
    scheme?: (url: URL) => string | undefined
  }
}

/**
 * `m.me/<page>` opens a thread with that page; `m.me/rn/<page>` is the
 * recurring-notification opt-in surface, which has no thread to jump to. Only
 * the single-segment form yields an id.
 */
const messengerThreadId = (url: URL): string | undefined => {
  const segments = url.pathname.split("/").filter(Boolean)
  return segments.length === 1 ? segments[0] : undefined
}

/**
 * Ordered most-specific first — `matchDeepLinkApp` returns the first hit, so a
 * path-narrowed rule must precede the catch-all for the same host. Moving
 * `zalo` above `zaloGroup` would silently relabel every group invite.
 */
export const DEEP_LINK_APPS: readonly DeepLinkApp[] = [
  {
    id: "zaloGroup",
    hosts: ["zalo.me", "chat.zalo.me"],
    pathPattern: /^\/g\//,
    appName: "Zalo",
    channel: "zalo",
    android: { package: "com.zing.zalo" },
    ios: { appStoreId: "579523206" },
  },
  {
    id: "zalo",
    hosts: ["zalo.me", "chat.zalo.me"],
    appName: "Zalo",
    channel: "zalo",
    android: { package: "com.zing.zalo" },
    ios: { appStoreId: "579523206" },
  },
  {
    id: "messenger",
    hosts: ["m.me"],
    appName: "Messenger",
    // Deliberately no `channel`. The self-channel exemption rests on "a link to
    // an app, opened from inside that app, already works" — and for `m.me` in
    // Messenger's own iOS webview that is exactly the assumption that is false:
    // the tap does nothing at all. Setting `channel: "messenger"` here would
    // exempt the one case this rule exists to fix.
    android: { package: "com.facebook.orca" },
    ios: {
      appStoreId: "454638411",
      // UNVERIFIED. Tried as a button href and it blanked the webview, which
      // proves only that a scheme must never be an href — App Links resolves
      // `al:ios:url` natively, before any webview opens, so that test says
      // nothing about this path. Kept because `al:web:should_fallback` is now
      // `true`: if Messenger cannot open it, the tap lands on this page and its
      // button rather than failing. Replace once a scheme is confirmed by
      // pasting it into Safari on a device.
      scheme: (url) => {
        const pageId = messengerThreadId(url)
        return pageId ? `fb-messenger://user-thread/${pageId}` : undefined
      },
    },
  },
]

/**
 * The host form a rule is matched against, and the one handed to the app.
 *
 * Both callers must use this. `matchDeepLinkApp` decided the app handles
 * `zalo.me`; if `buildAppLinkTargets` then emits `intent://www.zalo.me/…` and
 * the app's manifest declares no `www.` host filter, no activity resolves and
 * Android silently drops to the browser fallback — the app never opens.
 */
const normalizeDeepLinkHost = (hostname: string): string => {
  const lower = hostname.toLowerCase()
  return lower.startsWith("www.") ? lower.slice(4) : lower
}

/**
 * The app a URL belongs to, or `undefined` when a webview can render it itself.
 *
 * Only absolute `http(s)` URLs match. That also makes this the place the
 * interstitial's `javascript:` / `data:` rejection falls out of naturally.
 */
export const matchDeepLinkApp = (url: string): DeepLinkApp | undefined => {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return
  }

  const hostname = normalizeDeepLinkHost(parsed.hostname)

  return DEEP_LINK_APPS.find(
    (app) =>
      app.hosts.includes(hostname) &&
      (app.pathPattern ? app.pathPattern.test(parsed.pathname) : true),
  )
}

export type AppLinkTargets = {
  androidPackage: string
  /**
   * Android-only `intent://` form, used as the interstitial button's href so a
   * tap reaches the app even when App Links did not fire.
   * `S.browser_fallback_url` keeps a device without the app on the web page
   * rather than on an error.
   */
  androidIntentUrl: string
  /**
   * A custom-scheme URL for iOS, present only when the rule declares a verified
   * one. Absent means no `al:ios:*` tags are emitted — see `DeepLinkApp.ios`.
   */
  iosUrl?: string
  iosAppStoreId?: string
  /** The original https destination: the button's default href, and `og:url`. */
  webUrl: string
}

const ANDROID_UA = /android/i

export type DeepLinkNavigation = {
  /** Where a tap should go. */
  href: string
  /** Whether the interstitial may navigate there by itself, without a tap. */
  auto: boolean
}

/**
 * Where the interstitial should send this visitor, and whether it may go there
 * on its own.
 *
 * Android gets `intent://`, a form its WebView understands natively: it either
 * reaches the app or honours `browser_fallback_url`. That is a real upgrade, so
 * the page goes there immediately and the contact never sees a button.
 *
 * `auto: true` is a best effort, not a guarantee. Chrome Custom Tabs and most
 * Android in-app browsers refuse to launch an external intent without user
 * activation, and the page's navigation carries none — so on those the button
 * still appears. That is why the button stays rather than being hidden behind
 * `auto`, and why "Android still shows the button" is expected rather than a
 * bug to chase. Faking a gesture is not on the table.
 *
 * Everywhere else keeps the https URL, and `auto` is false. Every destination
 * that reaches this page is by definition one a webview cannot render — that is
 * the entire reason the rule is in `DEEP_LINK_APPS` — so navigating there
 * automatically just drops the contact on the blank page the detour exists to
 * avoid. Better to hold them on a page that has a button and can be opened in a
 * real browser.
 *
 * A custom scheme must NEVER be returned as `href`. A webview sent to a scheme
 * its host app does not handle renders nothing. `AppLinkTargets.iosUrl` exists
 * for the `al:ios:url` meta tag, which Messenger resolves natively before any
 * webview opens, and for nothing else.
 */
export const resolveDeepLinkNavigation = (
  targets: AppLinkTargets,
  userAgent: string,
): DeepLinkNavigation =>
  ANDROID_UA.test(userAgent)
    ? { href: targets.androidIntentUrl, auto: true }
    : { href: targets.webUrl, auto: false }

export const buildAppLinkTargets = (
  url: string,
  app: DeepLinkApp,
): AppLinkTargets => {
  const parsed = new URL(url)
  const scheme = parsed.protocol.slice(0, -1)
  // The normalized host, matching what `matchDeepLinkApp` asserted the app
  // handles. `browser_fallback_url` below keeps the original URL untouched,
  // since that is the real web address.
  const host = normalizeDeepLinkHost(parsed.host)
  const schemeless = `${host}${parsed.pathname}${parsed.search}`
  const iosUrl = app.ios?.scheme?.(parsed)

  return {
    androidPackage: app.android.package,
    androidIntentUrl: `intent://${schemeless}#Intent;scheme=${scheme};package=${app.android.package};S.browser_fallback_url=${encodeURIComponent(url)};end`,
    iosUrl,
    // Pointless on its own: the spec makes `al:ios:url` the required half.
    iosAppStoreId: iosUrl ? app.ios?.appStoreId : undefined,
    webUrl: url,
  }
}
