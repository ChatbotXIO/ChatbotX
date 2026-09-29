// @vitest-environment jsdom

import type { ChannelType } from "@chatbotx.io/database/partials"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockUseParams,
  privateListBroadcastOptionsAPI,
  listRefLinkOptionsAuthenticatedAPI,
} = vi.hoisted(() => ({
  mockUseParams: vi.fn(),
  privateListBroadcastOptionsAPI: vi.fn(),
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

const { useBroadcastSelectOptions, useReflinkSelectOptions } = await import(
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
})
