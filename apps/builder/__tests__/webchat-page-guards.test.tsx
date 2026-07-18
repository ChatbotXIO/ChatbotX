// @vitest-environment node

import { isValidElement } from "react"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockFindFirst,
  mockGetDomainFromHeader,
  mockHeaders,
  mockWorkspaceFind,
} = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockGetDomainFromHeader: vi.fn(),
  mockHeaders: vi.fn(),
  mockWorkspaceFind: vi.fn(),
}))

vi.mock("next/headers", () => ({
  headers: mockHeaders,
}))

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound")
  }),
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceService: { find: mockWorkspaceFind },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      integrationWebchatModel: { findFirst: mockFindFirst },
    },
  },
}))

vi.mock("@/lib/domain", () => ({
  getDomainFromHeader: mockGetDomainFromHeader,
}))

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn((namespace?: string) => {
    const messages: Record<string, string> = {
      "webchat.chatUnavailable": "This chat is currently unavailable.",
      "webchat.unauthorizedDomain.title": "Webchat unavailable",
      "webchat.unauthorizedDomain.description":
        "This website is not authorized to load this chat widget.",
    }

    return Promise.resolve(
      (key: string) => messages[namespace ? `${namespace}.${key}` : key] ?? key,
    )
  }),
}))

vi.mock("@/features/integration-webchat/lib/guest-conversation-id", () => ({
  createGuestConversationId: vi.fn(() => "workspace-1:guest-1"),
}))

vi.mock("@/features/integration-webchat/lib/webchat-access-token", () => ({
  createWebchatAccessToken: vi.fn().mockResolvedValue("access-token"),
}))

vi.mock(
  "@/features/integration-webchat/providers/store/guest-session-provider",
  () => ({
    GuestSessionStoreProvider: (props: unknown) => ({
      type: "GuestSessionStoreProvider",
      props,
    }),
  }),
)

vi.mock(
  "@/features/integration-webchat/providers/store/lib/webchat-client-config",
  () => ({
    toWebchatClientConfig: vi.fn((webchat) => webchat),
  }),
)

vi.mock("@/features/integration-webchat/webchat-wrapper", () => ({
  WebchatWrapper: (props: unknown) => ({ type: "WebchatWrapper", props }),
}))

const { default: WebchatPage } = await import(
  "../src/app/(no-sidebar)/webchat/page"
)

const targetWebchat = {
  id: "webchat-1",
  workspaceId: "ws-1",
  authorizedDomains: ["allowed.example"],
}

const searchParams = {
  workspaceId: "ws-1",
  webchatId: "webchat-1",
}

const setReferer = (referer: string | null) => {
  mockHeaders.mockResolvedValue({
    get: vi.fn((name: string) => (name === "referer" ? referer : null)),
  })
}

describe("WebchatPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindFirst.mockResolvedValue(targetWebchat)
    mockWorkspaceFind.mockResolvedValue({ scheduledDeletionAt: null })
    mockGetDomainFromHeader.mockResolvedValue("app.chatbotx.io")
  })

  test("renders the chat for a direct open with no referer, even with authorizedDomains configured", async () => {
    setReferer(null)

    const element = await WebchatPage({
      searchParams: Promise.resolve(searchParams),
    })

    expect(isValidElement(element)).toBe(true)
    expect((element as { type: { name: string } }).type.name).toBe(
      "GuestSessionStoreProvider",
    )
  })

  test("renders the chat for a first-party referer matching the app host", async () => {
    setReferer("https://app.chatbotx.io/some/path")

    const element = await WebchatPage({
      searchParams: Promise.resolve(searchParams),
    })

    expect((element as { type: { name: string } }).type.name).toBe(
      "GuestSessionStoreProvider",
    )
  })

  test("shows the unauthorized-domain message for a third-party referer not in authorizedDomains", async () => {
    setReferer("https://attacker.test")

    const element = await WebchatPage({
      searchParams: Promise.resolve(searchParams),
    })

    expect(isValidElement<{ children: unknown }>(element)).toBe(true)
    const rendered = JSON.stringify(element)
    expect(rendered).toContain("Webchat unavailable")
    expect(rendered).toContain(
      "This website is not authorized to load this chat widget.",
    )
  })

  test("still renders the chat for a third-party referer when authorizedDomains is empty", async () => {
    mockFindFirst.mockResolvedValue({ ...targetWebchat, authorizedDomains: [] })
    setReferer("https://anyone.example")

    const element = await WebchatPage({
      searchParams: Promise.resolve(searchParams),
    })

    expect((element as { type: { name: string } }).type.name).toBe(
      "GuestSessionStoreProvider",
    )
  })

  test("shows the chat-unavailable message when the workspace is scheduled for deletion", async () => {
    mockWorkspaceFind.mockResolvedValue({
      scheduledDeletionAt: new Date("2026-01-01T00:00:00Z"),
    })
    setReferer(null)

    const element = await WebchatPage({
      searchParams: Promise.resolve(searchParams),
    })

    const rendered = JSON.stringify(element)
    expect(rendered).toContain("This chat is currently unavailable.")
  })

  test("checks scheduled deletion before the authorized-domain gate", async () => {
    mockWorkspaceFind.mockResolvedValue({
      scheduledDeletionAt: new Date("2026-01-01T00:00:00Z"),
    })
    setReferer("https://attacker.test")

    const element = await WebchatPage({
      searchParams: Promise.resolve(searchParams),
    })

    const rendered = JSON.stringify(element)
    expect(rendered).toContain("This chat is currently unavailable.")
    expect(rendered).not.toContain(
      "This website is not authorized to load this chat widget.",
    )
  })

  test("returns notFound when the webchat does not exist", async () => {
    mockFindFirst.mockResolvedValue(undefined)

    await expect(
      WebchatPage({ searchParams: Promise.resolve(searchParams) }),
    ).rejects.toThrow("notFound")
  })

  test("returns notFound when searchParams fail validation", async () => {
    await expect(
      WebchatPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("notFound")
  })
})
