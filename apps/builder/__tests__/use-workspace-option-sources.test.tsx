// @vitest-environment jsdom

import type { ChannelType } from "@chatbotx.io/database/partials"
import { act, StrictMode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

type ChannelPostOption = {
  caption: string | null
  externalPostId: string
  id: string
  inboxName: string
  channel: ChannelType
  permalink: string | null
  thumbnailUrl: string | null
}

const {
  mockUseParams,
  privateGetChannelPostOptionsByIdsAPI,
  privateListBroadcastOptionsAPI,
  privateListChannelPostOptionsAPI,
  listRefLinkOptionsAuthenticatedAPI,
} = vi.hoisted(() => ({
  mockUseParams: vi.fn(),
  privateGetChannelPostOptionsByIdsAPI: vi.fn(),
  privateListBroadcastOptionsAPI: vi.fn(),
  privateListChannelPostOptionsAPI: vi.fn(),
  listRefLinkOptionsAuthenticatedAPI: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useParams: mockUseParams,
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    broadcastAPIs: {
      privateListBroadcastOptionsAPI,
    },
    channelPostAPIs: {
      privateGetChannelPostOptionsByIdsAPI,
      privateListChannelPostOptionsAPI,
    },
    refLinksAPI: {
      listRefLinkOptionsAuthenticatedAPI,
    },
  },
}))

vi.mock("@/features/coupons/provider/use-coupon-topic-options", () => {
  const options: never[] = []
  return {
    useCouponTopicOptions: () => ({ options }),
  }
})

vi.mock("@/features/custom-fields/provider/custom-field-hook", () => {
  const fields: never[] = []
  return {
    useBotFields: () => ({ data: fields }),
    useCustomFields: () => ({ data: fields }),
  }
})

vi.mock("@/features/flows/provider/flow-hook", () => {
  const options: never[] = []
  return {
    useFlowSelectOptions: () => options,
  }
})

vi.mock("@/features/inboxes/provider/inbox-hook", () => {
  const options: never[] = []
  return {
    useInboxOptionsByChannel: () => options,
  }
})

vi.mock("@/features/sequences/provider/sequence-hook", () => {
  const options: never[] = []
  return {
    useSequenceOptions: () => options,
  }
})

vi.mock("@/features/tags/provider/tag-hook", () => {
  const options: never[] = []
  return {
    useTagSelectOptions: () => options,
  }
})

vi.mock("@/features/users/provider/user-hook", () => {
  const options: never[] = []
  return {
    useContactAssigneeOptions: () => options,
  }
})

vi.mock("@/features/contact-filter/components/use-filter-value-labels", () => ({
  useFilterValueLabels: () => undefined,
}))

vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "workspace-id",
}))

const {
  useBroadcastSelectOptions,
  useChannelPostSelectOptions,
  useReflinkSelectOptions,
} = await import(
  "../src/features/contact-filter/components/use-workspace-option-sources"
)
const { useContactFilterConfigs } = await import(
  "../src/features/contact-filter/components/use-contact-filter-configs"
)

function BroadcastProbe({
  channel,
  onRender,
}: {
  channel?: ChannelType
  onRender: (options: unknown) => void
}) {
  onRender(useBroadcastSelectOptions(channel))
  return null
}

function ContactFilterConfigsProbe({
  inboxChannel,
}: {
  inboxChannel?: string
}) {
  useContactFilterConfigs(inboxChannel)
  return null
}

function ReflinkProbe({ onRender }: { onRender: (options: unknown) => void }) {
  onRender(useReflinkSelectOptions())
  return null
}

function ChannelPostProbe({
  onRender,
  selectedIds,
}: {
  onRender: (result: ReturnType<typeof useChannelPostSelectOptions>) => void
  selectedIds?: string[]
}) {
  onRender(useChannelPostSelectOptions(selectedIds))
  return null
}

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

describe("useWorkspaceOptionEndpoint (via useBroadcastSelectOptions/useReflinkSelectOptions)", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    // Distinct workspace id per test run (all module-level caches are keyed
    // by workspaceId:source:searchParams) so tests never share a cache entry.
    mockUseParams.mockReturnValue({ workspaceId: `ws-${Math.random()}` })
    privateListBroadcastOptionsAPI.mockResolvedValue({
      data: [{ id: "b1", name: "Broadcast One" }],
    })
    privateListChannelPostOptionsAPI.mockResolvedValue({
      items: [],
      nextCursor: undefined,
    })
    privateGetChannelPostOptionsByIdsAPI.mockResolvedValue({ data: [] })
    listRefLinkOptionsAuthenticatedAPI.mockResolvedValue({
      data: [{ id: "r1", name: "Reflink One" }],
    })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  test("useBroadcastSelectOptions calls privateListBroadcastOptionsAPI with the whatsapp channel default", async () => {
    let latest: unknown
    act(() => {
      root.render(<BroadcastProbe onRender={(options) => (latest = options)} />)
    })
    await flush()

    expect(privateListBroadcastOptionsAPI).toHaveBeenCalledTimes(1)
    expect(privateListBroadcastOptionsAPI.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ channel: "whatsapp" }),
    )
    expect(latest).toEqual([{ value: "b1", label: "Broadcast One" }])
    expect(listRefLinkOptionsAuthenticatedAPI).not.toHaveBeenCalled()
  })

  test.each([
    "messenger",
    "telegram",
  ] satisfies ChannelType[])("useBroadcastSelectOptions fetches %s broadcast options", async (channel) => {
    act(() => {
      root.render(
        <BroadcastProbe channel={channel} onRender={() => undefined} />,
      )
    })
    await flush()

    expect(privateListBroadcastOptionsAPI).toHaveBeenCalledTimes(1)
    expect(privateListBroadcastOptionsAPI).toHaveBeenCalledWith(
      expect.objectContaining({ channel }),
    )
  })

  test.each([
    "omnichannel",
    "unsupported-channel",
  ])("useContactFilterConfigs falls back to whatsapp for %s", async (inboxChannel) => {
    act(() => {
      root.render(<ContactFilterConfigsProbe inboxChannel={inboxChannel} />)
    })
    await flush()

    expect(privateListBroadcastOptionsAPI).toHaveBeenCalledTimes(1)
    expect(privateListBroadcastOptionsAPI).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "whatsapp" }),
    )
  })

  test("useContactFilterConfigs forwards a valid channel", async () => {
    act(() => {
      root.render(<ContactFilterConfigsProbe inboxChannel="messenger" />)
    })
    await flush()

    expect(privateListBroadcastOptionsAPI).toHaveBeenCalledTimes(1)
    expect(privateListBroadcastOptionsAPI).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "messenger" }),
    )
  })

  test("useReflinkSelectOptions calls listRefLinkOptionsAuthenticatedAPI, not the broadcasts endpoint", async () => {
    let latest: unknown
    act(() => {
      root.render(<ReflinkProbe onRender={(options) => (latest = options)} />)
    })
    await flush()

    expect(listRefLinkOptionsAuthenticatedAPI).toHaveBeenCalledTimes(1)
    expect(latest).toEqual([{ value: "r1", label: "Reflink One" }])
    expect(privateListBroadcastOptionsAPI).not.toHaveBeenCalled()
  })

  test("re-rendering with the same channel keeps search params stable and does not refetch", async () => {
    const workspaceId = `ws-${Math.random()}`
    mockUseParams.mockReturnValue({ workspaceId })

    act(() => {
      root.render(
        <BroadcastProbe channel="messenger" onRender={() => undefined} />,
      )
    })
    await flush()
    expect(privateListBroadcastOptionsAPI).toHaveBeenCalledTimes(1)

    act(() => {
      root.render(
        <BroadcastProbe channel="messenger" onRender={() => undefined} />,
      )
    })
    await flush()

    // Same workspaceId:source:searchParams cache key — no second call.
    expect(privateListBroadcastOptionsAPI).toHaveBeenCalledTimes(1)
  })

  test("broadcast cache entries are separated by channel", async () => {
    const workspaceId = `ws-${Math.random()}`
    mockUseParams.mockReturnValue({ workspaceId })

    act(() => {
      root.render(
        <BroadcastProbe channel="messenger" onRender={() => undefined} />,
      )
    })
    await flush()

    act(() => {
      root.render(
        <BroadcastProbe channel="instagram" onRender={() => undefined} />,
      )
    })
    await flush()

    act(() => {
      root.render(
        <BroadcastProbe channel="messenger" onRender={() => undefined} />,
      )
    })
    await flush()

    expect(privateListBroadcastOptionsAPI).toHaveBeenCalledTimes(2)
    expect(
      privateListBroadcastOptionsAPI.mock.calls.map(([input]) => input),
    ).toEqual([
      expect.objectContaining({ channel: "messenger" }),
      expect.objectContaining({ channel: "instagram" }),
    ])
  })

  test("changing channel hides stale broadcast options while the new request is pending", async () => {
    let latest: unknown
    let resolveMessenger: (value: {
      data: { id: string; name: string }[]
    }) => void = () => undefined
    const messengerRequest = new Promise<{
      data: { id: string; name: string }[]
    }>((resolve) => {
      resolveMessenger = resolve
    })

    privateListBroadcastOptionsAPI.mockImplementation(({ channel }) =>
      channel === "messenger"
        ? messengerRequest
        : Promise.resolve({
            data: [{ id: "wa-1", name: "WhatsApp Broadcast" }],
          }),
    )

    act(() => {
      root.render(
        <BroadcastProbe
          channel="whatsapp"
          onRender={(options) => (latest = options)}
        />,
      )
    })
    await flush()
    expect(latest).toEqual([{ value: "wa-1", label: "WhatsApp Broadcast" }])

    act(() => {
      root.render(
        <BroadcastProbe
          channel="messenger"
          onRender={(options) => (latest = options)}
        />,
      )
    })

    expect(latest).toEqual([])

    await act(async () => {
      resolveMessenger({
        data: [{ id: "ms-1", name: "Messenger Broadcast" }],
      })
      await messengerRequest
    })

    expect(latest).toEqual([{ value: "ms-1", label: "Messenger Broadcast" }])
  })

  test("broadcasts and reflinks for the same workspace hit distinct cache keys (different source)", async () => {
    const workspaceId = `ws-${Math.random()}`
    mockUseParams.mockReturnValue({ workspaceId })

    act(() => {
      root.render(
        <>
          <BroadcastProbe onRender={() => undefined} />
          <ReflinkProbe onRender={() => undefined} />
        </>,
      )
    })
    await flush()

    expect(privateListBroadcastOptionsAPI).toHaveBeenCalledTimes(1)
    expect(listRefLinkOptionsAuthenticatedAPI).toHaveBeenCalledTimes(1)
  })

  test("hydrates a saved post label after StrictMode replays the effect", async () => {
    let latest: ReturnType<typeof useChannelPostSelectOptions> | undefined
    let resolveSavedPosts: (value: { data: ChannelPostOption[] }) => void =
      () => undefined
    const savedPostsRequest = new Promise<{ data: ChannelPostOption[] }>(
      (resolve) => {
        resolveSavedPosts = resolve
      },
    )
    privateGetChannelPostOptionsByIdsAPI.mockReturnValue(savedPostsRequest)

    act(() => {
      root.render(
        <StrictMode>
          <ChannelPostProbe
            onRender={(result) => (latest = result)}
            selectedIds={["1"]}
          />
        </StrictMode>,
      )
    })

    expect(privateGetChannelPostOptionsByIdsAPI).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolveSavedPosts({
        data: [
          {
            caption: "Saved post",
            externalPostId: "external-1",
            id: "1",
            inboxName: "Instagram",
            channel: "instagram",
            permalink: null,
            thumbnailUrl: null,
          },
        ],
      })
      await savedPostsRequest
    })

    expect(latest?.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Saved post", value: "1" }),
      ]),
    )
  })

  test("ignores a completed hydration for posts no longer selected", async () => {
    let latest: ReturnType<typeof useChannelPostSelectOptions> | undefined
    const requests = new Map<
      string,
      { resolve: (value: { data: ChannelPostOption[] }) => void }
    >()
    privateGetChannelPostOptionsByIdsAPI.mockImplementation(
      ({ ids }: { ids: string[] }) =>
        new Promise<{ data: ChannelPostOption[] }>((resolve) => {
          requests.set(ids.join(","), { resolve })
        }),
    )

    act(() => {
      root.render(
        <ChannelPostProbe
          onRender={(result) => (latest = result)}
          selectedIds={["1"]}
        />,
      )
    })
    act(() => {
      root.render(
        <ChannelPostProbe
          onRender={(result) => (latest = result)}
          selectedIds={["2"]}
        />,
      )
    })

    await act(async () => {
      requests.get("1")?.resolve({
        data: [
          {
            caption: "Old post",
            externalPostId: "external-1",
            id: "1",
            inboxName: "Instagram",
            channel: "instagram",
            permalink: null,
            thumbnailUrl: null,
          },
        ],
      })
      await Promise.resolve()
    })
    expect(latest?.options).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ value: "1" })]),
    )

    await act(async () => {
      requests.get("2")?.resolve({
        data: [
          {
            caption: "New post",
            externalPostId: "external-2",
            id: "2",
            inboxName: "Instagram",
            channel: "instagram",
            permalink: null,
            thumbnailUrl: null,
          },
        ],
      })
      await Promise.resolve()
    })
    expect(latest?.options).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: "2" })]),
    )
  })

  test("retries a failed saved-post hydration", async () => {
    let latest: ReturnType<typeof useChannelPostSelectOptions> | undefined
    privateGetChannelPostOptionsByIdsAPI
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce({
        data: [
          {
            caption: "Recovered post",
            externalPostId: "external-1",
            id: "1",
            inboxName: "Instagram",
            channel: "instagram",
            permalink: null,
            thumbnailUrl: null,
          },
        ],
      })

    act(() => {
      root.render(
        <ChannelPostProbe
          onRender={(result) => (latest = result)}
          selectedIds={["1"]}
        />,
      )
    })
    await flush()
    expect(latest?.error).toBe(true)

    act(() => latest?.retry())
    await flush()

    expect(privateGetChannelPostOptionsByIdsAPI).toHaveBeenCalledTimes(2)
    expect(latest?.options).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: "1" })]),
    )
  })

  test("hydrates more than 100 saved posts in bounded requests", async () => {
    let latest: ReturnType<typeof useChannelPostSelectOptions> | undefined
    const selectedIds = Array.from({ length: 101 }, (_, index) =>
      String(index + 1),
    )
    privateGetChannelPostOptionsByIdsAPI.mockImplementation(
      ({ ids }: { ids: string[] }) =>
        Promise.resolve({
          data: ids.map((id: string) => ({
            caption: `Post ${id}`,
            externalPostId: `external-${id}`,
            id,
            inboxName: "Instagram",
            channel: "instagram",
            permalink: null,
            thumbnailUrl: null,
          })),
        }),
    )

    act(() => {
      root.render(
        <ChannelPostProbe
          onRender={(result) => (latest = result)}
          selectedIds={selectedIds}
        />,
      )
    })
    await flush()

    expect(privateGetChannelPostOptionsByIdsAPI).toHaveBeenCalledTimes(2)
    expect(
      privateGetChannelPostOptionsByIdsAPI.mock.calls.map(
        ([input]) => input.ids.length,
      ),
    ).toEqual([100, 1])
    expect(latest?.options).toHaveLength(101)
  })
})
