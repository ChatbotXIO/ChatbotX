import {
  broadcastSubactions,
  channelTypes,
} from "@chatbotx.io/database/partials"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { createContactStore } from "../contact-store"

const mocks = vi.hoisted(() => ({
  countContactsAuthenticatedAPI: vi.fn(),
  countContactInboxesAuthenticatedAPI: vi.fn(),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    contactsAPIs: {
      countContactsAuthenticatedAPI: mocks.countContactsAuthenticatedAPI,
      countContactInboxesAuthenticatedAPI:
        mocks.countContactInboxesAuthenticatedAPI,
    },
  },
}))

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })

  return { promise, resolve }
}

beforeEach(() => {
  mocks.countContactsAuthenticatedAPI.mockReset()
  mocks.countContactInboxesAuthenticatedAPI.mockReset()
})

describe("contact store getContactInboxesCount", () => {
  test("does not drop overlapping inbox count requests and keeps the latest result", async () => {
    const first = deferred<{ total: number }>()
    const second = deferred<{ total: number }>()

    mocks.countContactInboxesAuthenticatedAPI
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)

    const store = createContactStore({ workspaceId: "ws-1" })

    const firstRequest = store.getState().getContactInboxesCount({
      channel: channelTypes.enum.whatsapp,
    })
    const secondRequest = store.getState().getContactInboxesCount({
      channel: channelTypes.enum.messenger,
    })

    expect(mocks.countContactInboxesAuthenticatedAPI).toHaveBeenCalledTimes(2)

    second.resolve({ total: 20 })
    await secondRequest
    expect(store.getState().contactInboxesCount).toBe(20)
    expect(store.getState().loadingInboxesCount).toBe(false)

    first.resolve({ total: 10 })
    await firstRequest
    expect(store.getState().contactInboxesCount).toBe(20)
  })

  test("forwards channel, integration ids, contactFilter, and subaction to the count API", async () => {
    mocks.countContactInboxesAuthenticatedAPI.mockResolvedValue({ total: 3 })

    const store = createContactStore({ workspaceId: "ws-1" })
    const contactFilter = {
      operator: "and" as const,
      conditions: [
        {
          field: "fullName" as const,
          operator: "contains" as const,
          value: "Ada",
        },
      ],
    }

    await store.getState().getContactInboxesCount({
      channel: channelTypes.enum.whatsapp,
      integrationWhatsappId: "wa-1",
      integrationMessengerId: "messenger-1",
      contactFilter,
      subaction: broadcastSubactions.enum.whatsappWithin24Hours,
    })

    expect(mocks.countContactInboxesAuthenticatedAPI).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      sort: [],
      channels: [channelTypes.enum.whatsapp],
      integrationWhatsappId: "wa-1",
      integrationMessengerId: "messenger-1",
      contactFilter,
      subaction: broadcastSubactions.enum.whatsappWithin24Hours,
    })
    expect(store.getState().contactInboxesCount).toBe(3)
  })

  test("fails closed by forwarding an empty channel list when channel is missing", async () => {
    mocks.countContactInboxesAuthenticatedAPI.mockResolvedValue({ total: 0 })

    const store = createContactStore({ workspaceId: "ws-1" })

    await store.getState().getContactInboxesCount()

    expect(mocks.countContactInboxesAuthenticatedAPI).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      sort: [],
      channels: [],
      integrationWhatsappId: undefined,
      integrationMessengerId: undefined,
      contactFilter: undefined,
      subaction: undefined,
    })
    expect(store.getState().contactInboxesCount).toBe(0)
  })
})
