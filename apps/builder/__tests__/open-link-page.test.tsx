// @vitest-environment node

import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mockRedirect = vi.hoisted(() => vi.fn())
const mockNotFound = vi.hoisted(() => vi.fn())
const mockLoadServableWorkspace = vi.hoisted(() => vi.fn())
const mockResolveOpenLinkDestination = vi.hoisted(() => vi.fn())
const mockUserAgent = vi.hoisted(() => ({ value: "" }))
const mockPageUrl = vi.hoisted(() => ({ value: null as string | null }))

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
  notFound: mockNotFound,
}))

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => {
      if (name === "user-agent") {
        return mockUserAgent.value
      }
      return name === "x-url" ? mockPageUrl.value : null
    },
  }),
}))

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

vi.mock("@/lib/workspace/load-servable-workspace", () => ({
  loadServableWorkspace: mockLoadServableWorkspace,
}))

vi.mock("@chatbotx.io/business/open-link", () => ({
  resolveOpenLinkDestination: mockResolveOpenLinkDestination,
}))

// The fallback button's own rendering is not what this file is about; the
// App Links markup and the pre-paint redirect are.
vi.mock("@/features/open-link/components/open-link-button", () => ({
  OpenLinkButton: ({ appId, href }: { appId: string; href: string }) => (
    <button data-app-id={appId} data-href={href} type="button" />
  ),
}))

const { default: OpenLinkPage } = await import(
  "../src/app/go/[workspaceId]/page"
)

const render = async (searchParams: Record<string, string>) => {
  const element = await OpenLinkPage({
    params: Promise.resolve({ workspaceId: "ws-1" }),
    searchParams: Promise.resolve(searchParams),
  })
  return element ? renderToStaticMarkup(element) : ""
}

describe("open link interstitial", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUserAgent.value = ""
    mockPageUrl.value = "https://app.example.test/go/ws-1?u=encoded&s=signature"
    mockLoadServableWorkspace.mockResolvedValue({ servable: true })
  })

  test("emits App Links meta tags for a recognised destination", async () => {
    mockResolveOpenLinkDestination.mockReturnValue(
      "https://zalo.me/g/owfqvp123",
    )

    const markup = await render({ u: "encoded", s: "signature" })

    // `property=`, not `name=`: Meta's App Links parser reads only the former,
    // and Next's `Metadata.other` would have emitted the latter. The whole
    // app-launch path hangs off this one attribute name.
    expect(markup).toContain('property="al:android:package"')
    expect(markup).toContain('content="com.zing.zalo"')
    expect(markup).toContain('data-app-id="zaloGroup"')
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  test("canonicalises to this page, never to the destination", () => {
    // `og:url` is a canonical declaration. Pointing it at the destination folds
    // this object into the destination's entry in the crawler's index, where
    // these `al:*` tags no longer belong to it — silently defeating the one
    // mechanism the page exists for, with no symptom beyond "App Links never
    // fire".
    mockPageUrl.value = "https://app.example.test/go/ws-1?u=encoded&s=signature"
    mockResolveOpenLinkDestination.mockReturnValue(
      "https://zalo.me/g/owfqvp123",
    )

    return render({ u: "encoded", s: "signature" }).then((markup) => {
      // `&` arrives HTML-escaped, as it should.
      expect(markup).toContain(
        '<meta content="https://app.example.test/go/ws-1?u=encoded&amp;s=signature" property="og:url"/>',
      )
      expect(markup).not.toContain(
        '<meta content="https://zalo.me/g/owfqvp123" property="og:url"/>',
      )
    })
  })

  test("omits og:url rather than guessing when the proxy header is absent", () => {
    mockPageUrl.value = null
    mockResolveOpenLinkDestination.mockReturnValue(
      "https://zalo.me/g/owfqvp123",
    )

    return render({ u: "encoded", s: "signature" }).then((markup) => {
      expect(markup).not.toContain("og:url")
    })
  })

  test("on Android, leaves before the fallback button is painted", async () => {
    // The redirect has to be an inline script, not a `useEffect`: an effect
    // waits for the JS bundle and hydration, and the button is on screen for
    // that whole gap. It also has to stay a script rather than a server 302 —
    // a 302 carries no HTML, so the crawler would never read the `al:*` tags
    // and Messenger could never launch the app natively.
    mockUserAgent.value = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36"
    mockResolveOpenLinkDestination.mockReturnValue(
      "https://zalo.me/g/owfqvp123",
    )

    const markup = await render({ u: "encoded", s: "signature" })

    const scriptAt = markup.indexOf("location.replace")
    const buttonAt = markup.indexOf("<button")
    expect(scriptAt).toBeGreaterThan(-1)
    expect(markup).toContain("intent://zalo.me/g/owfqvp123")
    expect(scriptAt).toBeLessThan(buttonAt)
  })

  test("on iOS, stays put instead of navigating to the blank destination", async () => {
    // Auto-navigating to the https URL here sends the contact straight to the
    // page that renders blank inside the webview — the exact failure this
    // detour exists to prevent. The page holds them and offers the button.
    mockUserAgent.value =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
    mockResolveOpenLinkDestination.mockReturnValue(
      "https://zalo.me/g/owfqvp123",
    )

    const markup = await render({ u: "encoded", s: "signature" })

    expect(markup).not.toContain("location.replace")
    expect(markup).toContain('data-href="https://zalo.me/g/owfqvp123"')
  })

  test("never lets a failed app launch fail the whole navigation", async () => {
    // Per the App Links navigation spec, `should_fallback: false` means that
    // when no app target can be opened the navigation *fails* — the contact
    // taps and gets nothing: no app, no webview, no page. That is what made
    // iPhone taps dead while this page carries no iOS target.
    mockResolveOpenLinkDestination.mockReturnValue(
      "https://zalo.me/g/owfqvp123",
    )

    const markup = await render({ u: "encoded", s: "signature" })

    expect(markup).toContain(
      '<meta content="true" property="al:web:should_fallback"/>',
    )
  })

  test("emits no iOS tags while no rule declares a custom scheme", async () => {
    // `al:ios:url` must be a custom scheme. Emitting the https URL there is
    // what made `m.me` links dead-end on iPhone, so the whole iOS block is
    // withheld until a scheme is verified rather than filled with a plausible
    // guess.
    mockResolveOpenLinkDestination.mockReturnValue(
      "https://zalo.me/g/owfqvp123",
    )

    const markup = await render({ u: "encoded", s: "signature" })

    expect(markup).not.toContain("al:ios:url")
    expect(markup).not.toContain("al:ios:app_store_id")
  })

  test("gives an m.me thread Messenger's own iOS scheme", async () => {
    mockResolveOpenLinkDestination.mockReturnValue(
      "https://m.me/9679565075442614",
    )

    const markup = await render({ u: "encoded", s: "signature" })

    expect(markup).toContain('property="al:ios:url"')
    expect(markup).toContain(
      'content="fb-messenger://user-thread/9679565075442614"',
    )
  })

  test("leaves facebook.com out of the interstitial entirely", async () => {
    mockResolveOpenLinkDestination.mockReturnValue(
      "https://www.facebook.com/share/g/1FhUw8ij8B/",
    )

    await render({ u: "encoded", s: "signature" })

    expect(mockRedirect).toHaveBeenCalledWith(
      "https://www.facebook.com/share/g/1FhUw8ij8B/",
    )
  })

  test("redirects straight through for an unrecognised destination", async () => {
    mockResolveOpenLinkDestination.mockReturnValue("https://example.com/promo")

    await render({ u: "encoded", s: "signature" })

    expect(mockRedirect).toHaveBeenCalledWith("https://example.com/promo")
  })

  test("shows an error rather than redirecting when the signature fails", async () => {
    // Redirecting on an unverified destination is precisely what would make
    // this page an open redirect.
    mockResolveOpenLinkDestination.mockReturnValue(null)

    const markup = await render({ u: "encoded", s: "tampered" })

    expect(mockRedirect).not.toHaveBeenCalled()
    expect(markup).toContain("invalidTitle")
  })

  test("404s for a workspace that is no longer servable", async () => {
    mockLoadServableWorkspace.mockResolvedValue({ servable: false })

    await render({ u: "encoded", s: "signature" })

    expect(mockNotFound).toHaveBeenCalled()
    expect(mockResolveOpenLinkDestination).not.toHaveBeenCalled()
  })
})
