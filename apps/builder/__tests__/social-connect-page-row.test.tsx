// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { VisibleDestination } from "@/features/social-accounts/lib/connections"

vi.mock("next-intl", () => ({
  useFormatter: () => ({ dateTime: () => "FORMATTED_TIME" }),
  useTranslations: () => (key: string) => key,
}))
vi.mock("@/features/social-accounts/components/reconnect-button", () => ({
  ReconnectButton: ({ label }: { label: string }) => (
    <button type="button">{label}</button>
  ),
}))

const { ConnectPageRow } = await import(
  "@/features/social-accounts/components/connect-page-row"
)

const destination = (
  overrides: Partial<VisibleDestination> = {},
): VisibleDestination => ({
  avatar: null,
  contentTypes: ["text"],
  externalId: "ext-1",
  id: "d-1",
  inboxId: "i-1",
  integrationId: "int-1",
  missingScopes: [],
  name: "My Page",
  pausedUntil: null,
  pauseReason: null,
  profileUrl: null,
  provider: "facebook",
  socialAccountId: null,
  state: "ready",
  viaFacebook: false,
  ...overrides,
})

describe("ConnectPageRow", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = (
    item: ReturnType<typeof destination>,
    canManage = true,
    provider: "facebook" | "instagram" = "facebook",
  ) =>
    act(() =>
      root.render(
        <ul>
          <ConnectPageRow
            canManage={canManage}
            destination={item}
            provider={provider}
            readOnly={false}
            workspaceId="1"
          />
        </ul>,
      ),
    )

  /** The labels of the row's buttons ("Posting times" is always there). */
  const buttonLabels = () =>
    Array.from(container.querySelectorAll("button")).map(
      (button) => button.textContent,
    )

  test("a ready page shows a green state and only the posting times button", () => {
    render(destination())
    expect(container.textContent).toContain("composer.destinationState.ready")
    expect(buttonLabels()).toEqual(["posts.connect.schedule.open"])
  })

  test("a destination the network limited shows until when, and why on hover", () => {
    render(
      destination({
        pausedUntil: new Date(Date.now() + 3_600_000),
        pauseReason: "limitReached",
      }),
    )
    expect(container.textContent).toContain("composer.destinationPause.until")
    expect(
      container.querySelector(
        '[title="composer.destinationPause.reason.limitReached"]',
      ),
    ).not.toBeNull()
  })

  test("a pause that is over shows nothing", () => {
    render(
      destination({
        pausedUntil: new Date(Date.now() - 1000),
        pauseReason: "limitReached",
      }),
    )
    expect(container.textContent).not.toContain("destinationPause")
  })

  test("an expired page shows Reconnect", () => {
    render(destination({ state: "needsReconnect" }))
    expect(container.textContent).toContain(
      "composer.destinationState.needsReconnect",
    )
    expect(buttonLabels()).toContain("posts.connect.reconnect")
  })

  test("a page missing the permission asks to reconnect to allow publishing", () => {
    render(destination({ state: "permissionMissing" }))
    expect(buttonLabels()).toContain("posts.connect.reconnectToAllow")
  })

  test("members without manage permission see the state and no reconnect", () => {
    render(destination({ state: "needsReconnect" }), false)
    expect(container.textContent).toContain(
      "composer.destinationState.needsReconnect",
    )
    expect(buttonLabels()).toEqual(["posts.connect.schedule.open"])
  })

  test("Instagram through Facebook carries the via Facebook tag", () => {
    render(
      destination({ provider: "instagram", viaFacebook: true }),
      true,
      "instagram",
    )
    expect(container.textContent).toContain("composer.viaFacebook")
  })

  test("a page with a profile URL opens it in a new tab with a labelled link", () => {
    render(destination({ profileUrl: "https://www.facebook.com/123" }))
    const links = container.querySelectorAll("a")
    expect(links).toHaveLength(2)
    for (const link of Array.from(links)) {
      expect(link.getAttribute("href")).toBe("https://www.facebook.com/123")
      expect(link.getAttribute("target")).toBe("_blank")
      expect(link.getAttribute("rel")).toBe("noopener noreferrer")
    }
    expect(links[1]?.getAttribute("aria-label")).toBe("composer.openProfile")
    expect(links[0]?.getAttribute("tabindex")).toBe("-1")
  })

  test("a page without a profile URL renders its name as plain text", () => {
    render(destination())
    expect(container.querySelector("a")).toBeNull()
    expect(container.textContent).toContain("My Page")
  })
})
