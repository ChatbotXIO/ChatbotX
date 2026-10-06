import type { InboxWithIntegrations } from "@chatbotx.io/database/types"
import { describe, expect, test, vi } from "vitest"

vi.mock("../src/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const { buildInboxLink, buildInboxProfileLink, isProfileLinkChannel } =
  await import("../src/inbox/utils")

const { inboxWithIntegrationsResource } = await import("../src/inbox/schema")

const inbox = (overrides: Record<string, unknown>) =>
  ({
    id: "inbox-1",
    name: "Inbox",
    workspaceId: "workspace-1",
    sourceId: "source-1",
    channel: "messenger",
    ...overrides,
  }) as InboxWithIntegrations

describe("buildInboxProfileLink", () => {
  test("links a Threads inbox to its username, not the numeric sourceId", () => {
    expect(
      buildInboxProfileLink(
        inbox({
          channel: "threads",
          sourceId: "17841400000000001",
          integrationThreads: { username: "acme.shop" },
        }),
      ),
    ).toBe("https://www.threads.com/@acme.shop")
  })

  test("skips a Threads inbox whose integration is not loaded", () => {
    expect(buildInboxProfileLink(inbox({ channel: "threads" }))).toBeUndefined()
  })

  test("links a TikTok inbox to the handle stored as its sourceId", () => {
    expect(
      buildInboxProfileLink(
        inbox({ channel: "tiktok", sourceId: "acme.shop" }),
      ),
    ).toBe("https://www.tiktok.com/@acme.shop")
  })

  test("skips a TikTok inbox with no handle", () => {
    expect(
      buildInboxProfileLink(inbox({ channel: "tiktok", sourceId: "" })),
    ).toBeUndefined()
  })

  test("returns nothing for channels that have a chat link", () => {
    expect(buildInboxProfileLink(inbox({}))).toBeUndefined()
    expect(isProfileLinkChannel("messenger")).toBe(false)
    expect(isProfileLinkChannel("threads")).toBe(true)
    expect(isProfileLinkChannel("tiktok")).toBe(true)
  })

  test("leaves buildInboxLink unchanged for Threads", () => {
    // Flow Get Link and email buttons rely on Threads having no chat link.
    expect(
      buildInboxLink(
        "https://app.test",
        inbox({
          channel: "threads",
          integrationThreads: { username: "acme.shop" },
        }),
      ),
    ).toBeUndefined()
  })
})

describe("inboxWithIntegrationsResource", () => {
  const row = (overrides: Record<string, unknown>) => ({
    id: "1",
    workspaceId: "2",
    name: "Inbox",
    sourceId: "source-1",
    channel: "threads",
    status: "connected",
    markReadOnOutbound: false,
    disconnectedAt: null,
    disconnectReason: null,
    threadControlSeenAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  })

  // The builder's inbox list goes through this schema before the chat widget
  // dialog builds links: dropping the relation hid every Threads inbox.
  test("keeps the Threads username so the browser can build its profile link", () => {
    const parsed = inboxWithIntegrationsResource.parse(
      row({
        integrationThreads: {
          id: "3",
          inboxId: "1",
          name: "Acme",
          username: "acme.shop",
          auth: { accessToken: "secret" },
          threadsUserId: "17841400000000001",
        },
      }),
    )

    expect(parsed.integrationThreads).toEqual({
      id: "3",
      inboxId: "1",
      name: "Acme",
      username: "acme.shop",
    })
    expect(buildInboxProfileLink(parsed as InboxWithIntegrations)).toBe(
      "https://www.threads.com/@acme.shop",
    )
  })

  test("keeps the TikTok sourceId the profile link is built from", () => {
    const parsed = inboxWithIntegrationsResource.parse(
      row({ channel: "tiktok", sourceId: "acme.shop" }),
    )

    expect(buildInboxProfileLink(parsed as InboxWithIntegrations)).toBe(
      "https://www.tiktok.com/@acme.shop",
    )
  })
})
