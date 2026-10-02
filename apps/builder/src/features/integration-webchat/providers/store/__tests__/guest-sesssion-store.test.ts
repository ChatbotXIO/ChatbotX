// @vitest-environment node

import type { IntegrationWebchatModel } from "@chatbotx.io/database/types"
import ky from "ky"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { createGuestSessionStore } from "../guest-sesssion-store"

vi.mock("@/features/messages/actions/create-webchat-message.action", () => ({
  createWebchatMessageAction: {},
}))

vi.mock("ky", () => ({
  default: { get: vi.fn() },
}))

const createWebchatConfig = (
  overrides: Partial<IntegrationWebchatModel> = {},
) =>
  ({
    id: "webchat-1",
    workspaceId: "workspace-1",
    persistentMenus: [],
    ...overrides,
  }) as IntegrationWebchatModel

/**
 * Builds a message exactly as it comes over the wire — i.e. after a
 * `JSON.stringify`/`JSON.parse` round trip through `ky`'s `.json()`, which
 * turns every `Date` into an ISO string. `ky`'s `.get<T>().json()` generic is
 * a pure type assertion with no runtime effect, so this is the real shape
 * `refetchLatestMessages`/`loadMoreMessages` must cope with — not a
 * `MessageResource` with real `Date` instances.
 */
const makeWireMessage = (overrides: Record<string, unknown> = {}) => ({
  id: "msg-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  workspaceId: "workspace-1",
  conversationId: "workspace-1:server-guest",
  contactInboxId: "contact-inbox-1",
  text: "hello",
  contentAttributes: null,
  messageType: "incoming",
  contentType: "text",
  senderType: "contact",
  senderId: null,
  sourceId: null,
  deletedAt: null,
  type: "message",
  parentId: null,
  attributes: null,
  sendError: null,
  attachments: [],
  ...overrides,
})

describe("guest session store — ky response parsing", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("refetchLatestMessages resolves and sorts mixed local + fetched messages into real Date instances", async () => {
    // The wire payload uses string dates (the actual `.json()` shape), while
    // the local message below uses a real `Date` from `appendMessage` — the
    // merge-and-sort path must cope with both without throwing.
    const fetchedMessage = makeWireMessage({
      id: "backfilled-msg",
      createdAt: "2026-01-01T00:00:05.000Z",
      updatedAt: "2026-01-01T00:00:05.000Z",
    })

    vi.mocked(ky.get).mockReturnValue({
      json: () =>
        Promise.resolve({
          data: [fetchedMessage],
          nextCursor: null,
          prevCursor: null,
        }),
    } as never)

    const store = createGuestSessionStore(createWebchatConfig())
    store.getState().initGuestSession("workspace-1:server-guest")

    // Seed a locally-appended message (real `Date`) that arrived via the
    // socket before the backfill fetch below resolves.
    const localMessage = store.getState().appendMessage({
      id: "live-msg",
      createdAt: new Date("2026-01-01T00:00:10.000Z"),
      updatedAt: new Date("2026-01-01T00:00:10.000Z"),
    })

    await expect(
      store.getState().refetchLatestMessages(50),
    ).resolves.toBeUndefined()

    const { messages } = store.getState()

    expect(messages.map((message) => message.id)).toEqual([
      "backfilled-msg",
      "live-msg",
    ])
    for (const message of messages) {
      expect(message.createdAt).toBeInstanceOf(Date)
      expect(message.updatedAt).toBeInstanceOf(Date)
    }
    expect(
      messages.every(
        (message, index) =>
          index === 0 ||
          messages[index - 1].createdAt.getTime() <=
            message.createdAt.getTime(),
      ),
    ).toBe(true)
    expect(localMessage.createdAt).toBeInstanceOf(Date)
  })

  test("loadMoreMessages resolves and stores real Date instances from string-dated wire data", async () => {
    const olderMessage = makeWireMessage({
      id: "older-msg",
      createdAt: "2025-12-31T23:59:00.000Z",
      updatedAt: "2025-12-31T23:59:00.000Z",
    })

    vi.mocked(ky.get).mockReturnValue({
      json: () =>
        Promise.resolve({
          data: [olderMessage],
          nextCursor: "next-cursor",
          prevCursor: null,
        }),
    } as never)

    const store = createGuestSessionStore(createWebchatConfig())
    store.getState().initGuestSession("workspace-1:server-guest")

    await expect(
      store.getState().loadMoreMessages("workspace-1:server-guest", 50),
    ).resolves.toBeUndefined()

    const { messages, nextCursorMessage, hasNextMessagePage } = store.getState()

    expect(messages).toHaveLength(1)
    expect(messages[0].id).toBe("older-msg")
    expect(messages[0].createdAt).toBeInstanceOf(Date)
    expect(messages[0].updatedAt).toBeInstanceOf(Date)
    expect(nextCursorMessage).toBe("next-cursor")
    expect(hasNextMessagePage).toBe(true)
  })
})
