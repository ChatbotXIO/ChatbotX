// @vitest-environment jsdom

import { channelTypes } from "@chatbotx.io/database/partials"
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { makeQueryClient } from "../../../../../__tests__/query-test-utils"
import {
  allInboxConfigs,
  useConfiguredInboxTypeOptions,
  useInboxes,
  useInboxOptionsByChannel,
  useInboxOptionsForChannels,
  useInvalidateInboxes,
  useMessengerInboxOptions,
  useSmtpInboxFromAddressMap,
  useSmtpInboxOptions,
  useWhatsappInboxOptions,
} from "../inbox-hook"

const { mockListInboxes } = vi.hoisted(() => ({
  mockListInboxes: vi.fn(),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    inboxesAPI: {
      listAllInboxesAuthenticatedAPI: mockListInboxes,
    },
  },
}))

function InboxesProbe({
  workspaceId = "workspace-1",
  enabled = true,
  onData,
  onError,
}: {
  workspaceId?: string
  enabled?: boolean
  onData?: (data: unknown) => void
  onError?: (isError: boolean) => void
}) {
  const inboxes = useInboxes(workspaceId, { enabled })
  onData?.(inboxes.data)
  onError?.(inboxes.isError)
  return null
}

function InvalidateProbe({
  onReady,
  version: _version = 0,
}: {
  onReady: (fn: () => unknown) => void
  version?: number
}) {
  onReady(useInvalidateInboxes())
  return null
}

describe("inbox query hooks", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    mockListInboxes.mockResolvedValue({
      data: [{ id: "inbox-1", name: "Support" }],
    })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    queryClient = makeQueryClient()
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    queryClient.clear()
  })

  test("requests every inbox with integrations using the unpaginated endpoint", async () => {
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <InboxesProbe />
        </QueryClientProvider>,
      )
    })

    await vi.waitFor(() => {
      expect(mockListInboxes).toHaveBeenCalledTimes(1)
    })
    expect(mockListInboxes).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
        includes: ["integration"],
      },
      expect.anything(),
    )
  })

  test("unwraps inbox response data", async () => {
    const inboxes = [{ id: "inbox-2", name: "Sales" }]
    let data: unknown
    mockListInboxes.mockResolvedValue({ data: inboxes })

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <InboxesProbe onData={(nextData) => (data = nextData)} />
        </QueryClientProvider>,
      )
    })

    await vi.waitFor(() => {
      expect(data).toEqual(inboxes)
    })
  })

  test("surfaces a failed inbox request", async () => {
    let isError = false
    mockListInboxes.mockRejectedValue(new Error("inboxes failed"))

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <InboxesProbe onError={(nextIsError) => (isError = nextIsError)} />
        </QueryClientProvider>,
      )
    })

    await vi.waitFor(() => {
      expect(isError).toBe(true)
    })
  })

  test("does not request inboxes when disabled", () => {
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <InboxesProbe enabled={false} />
        </QueryClientProvider>,
      )
    })

    expect(mockListInboxes).not.toHaveBeenCalled()
  })

  test("invalidates inbox readers, and a refetch returns fresh data", async () => {
    let invalidate: (() => unknown) | null = null
    let data: unknown
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries")

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <InboxesProbe onData={(nextData) => (data = nextData)} />
          <InvalidateProbe onReady={(fn) => (invalidate = fn)} />
        </QueryClientProvider>,
      )
    })

    await vi.waitFor(() => {
      expect(data).toEqual([{ id: "inbox-1", name: "Support" }])
    })

    // A wrong query key on the invalidator would leave `data` stuck on the
    // stale value forever, timing the final `waitFor` out below.
    mockListInboxes.mockResolvedValue({
      data: [{ id: "inbox-2", name: "Refreshed" }],
    })

    await act(async () => {
      await invalidate?.()
    })

    expect(invalidateQueries).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => {
      expect(data).toEqual([{ id: "inbox-2", name: "Refreshed" }])
    })
  })

  test("keeps the invalidator stable across renders", () => {
    const invalidators: (() => unknown)[] = []

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <InvalidateProbe
            onReady={(fn) => invalidators.push(fn)}
            version={1}
          />
        </QueryClientProvider>,
      )
    })
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <InvalidateProbe
            onReady={(fn) => invalidators.push(fn)}
            version={2}
          />
        </QueryClientProvider>,
      )
    })

    expect(invalidators).toHaveLength(2)
    expect(invalidators[1]).toBe(invalidators[0])
  })
})

vi.mock("next/navigation", () => ({
  useParams: () => ({ workspaceId: "workspace-1" }),
}))

const derivedHookInboxes = [
  {
    id: "inbox-messenger",
    name: "Messenger Inbox",
    channel: channelTypes.enum.messenger,
  },
  {
    id: "inbox-whatsapp",
    name: "WhatsApp Inbox",
    channel: channelTypes.enum.whatsapp,
  },
  {
    id: "inbox-smtp-configured",
    name: "Support Email",
    channel: channelTypes.enum.smtp,
    integrationSmtp: {
      id: "smtp-integration-1",
      fromAddress: "support@example.com",
    },
  },
  {
    // A row for a channel that has never finished setup: present in the
    // inbox list, but with no linked SMTP integration to send from yet.
    id: "inbox-smtp-unconfigured",
    name: "Unconfigured Email",
    channel: channelTypes.enum.smtp,
  },
]

function ConfiguredInboxTypeOptionsProbe({
  enabled,
  onData,
}: {
  enabled?: boolean
  onData: (data: unknown) => void
}) {
  onData(useConfiguredInboxTypeOptions({ enabled }))
  return null
}

function InboxOptionsByChannelProbe({
  channel,
  excludeChannels,
  onData,
}: {
  channel?: string
  excludeChannels?: string[]
  onData: (data: unknown) => void
}) {
  onData(useInboxOptionsByChannel(channel, excludeChannels))
  return null
}

function InboxOptionsForChannelsProbe({
  channels,
  onData,
}: {
  channels: readonly string[]
  onData: (data: unknown) => void
}) {
  onData(useInboxOptionsForChannels(channels))
  return null
}

function WhatsappInboxOptionsProbe({
  onData,
}: {
  onData: (data: unknown) => void
}) {
  onData(useWhatsappInboxOptions())
  return null
}

function MessengerInboxOptionsProbe({
  onData,
}: {
  onData: (data: unknown) => void
}) {
  onData(useMessengerInboxOptions())
  return null
}

function SmtpInboxOptionsProbe({
  onData,
}: {
  onData: (data: unknown) => void
}) {
  onData(useSmtpInboxOptions())
  return null
}

function SmtpInboxFromAddressMapProbe({
  onData,
}: {
  onData: (data: unknown) => void
}) {
  onData(useSmtpInboxFromAddressMap())
  return null
}

describe("derived inbox option hooks", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient
  let data: unknown

  beforeEach(() => {
    vi.clearAllMocks()
    mockListInboxes.mockResolvedValue({ data: derivedHookInboxes })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    queryClient = makeQueryClient()
    data = undefined
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    queryClient.clear()
  })

  const renderProbe = (probe: React.ReactNode) => {
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>{probe}</QueryClientProvider>,
      )
    })
  }

  test("useConfiguredInboxTypeOptions always includes omnichannel plus every distinct non-smtp channel present", async () => {
    renderProbe(
      <ConfiguredInboxTypeOptionsProbe onData={(next) => (data = next)} />,
    )

    await vi.waitFor(() => {
      expect(data).toEqual([
        allInboxConfigs.omnichannel,
        allInboxConfigs.messenger,
        allInboxConfigs.whatsapp,
      ])
    })
  })

  test("useConfiguredInboxTypeOptions skips the fetch and returns only omnichannel when disabled", () => {
    renderProbe(
      <ConfiguredInboxTypeOptionsProbe
        enabled={false}
        onData={(next) => (data = next)}
      />,
    )

    expect(mockListInboxes).not.toHaveBeenCalled()
    expect(data).toEqual([allInboxConfigs.omnichannel])
  })

  test("useInboxOptionsByChannel excludes smtp inboxes by default when no channel is given", async () => {
    renderProbe(<InboxOptionsByChannelProbe onData={(next) => (data = next)} />)

    await vi.waitFor(() => {
      expect(data).toEqual([
        { label: "Messenger Inbox", value: "inbox-messenger" },
        { label: "WhatsApp Inbox", value: "inbox-whatsapp" },
      ])
    })
  })

  test("useInboxOptionsByChannel filters to an exact channel match", async () => {
    renderProbe(
      <InboxOptionsByChannelProbe
        channel={channelTypes.enum.whatsapp}
        onData={(next) => (data = next)}
      />,
    )

    await vi.waitFor(() => {
      expect(data).toEqual([
        { label: "WhatsApp Inbox", value: "inbox-whatsapp" },
      ])
    })
  })

  test("useInboxOptionsByChannel honors a caller-supplied exclude list instead of the smtp default", async () => {
    renderProbe(
      <InboxOptionsByChannelProbe
        excludeChannels={[channelTypes.enum.whatsapp]}
        onData={(next) => (data = next)}
      />,
    )

    await vi.waitFor(() => {
      expect(data).toEqual([
        { label: "Messenger Inbox", value: "inbox-messenger" },
        { label: "Support Email", value: "inbox-smtp-configured" },
        { label: "Unconfigured Email", value: "inbox-smtp-unconfigured" },
      ])
    })
  })

  test("useInboxOptionsForChannels keeps smtp inbox ids as-is, unlike useSmtpInboxOptions", async () => {
    renderProbe(
      <InboxOptionsForChannelsProbe
        channels={[channelTypes.enum.whatsapp, channelTypes.enum.smtp]}
        onData={(next) => (data = next)}
      />,
    )

    await vi.waitFor(() => {
      expect(data).toEqual([
        { label: "WhatsApp Inbox", value: "inbox-whatsapp" },
        { label: "Support Email", value: "inbox-smtp-configured" },
        { label: "Unconfigured Email", value: "inbox-smtp-unconfigured" },
      ])
    })
  })

  test("useWhatsappInboxOptions returns only whatsapp inboxes", async () => {
    renderProbe(<WhatsappInboxOptionsProbe onData={(next) => (data = next)} />)

    await vi.waitFor(() => {
      expect(data).toEqual([
        { label: "WhatsApp Inbox", value: "inbox-whatsapp" },
      ])
    })
  })

  test("useMessengerInboxOptions returns only messenger inboxes", async () => {
    renderProbe(<MessengerInboxOptionsProbe onData={(next) => (data = next)} />)

    await vi.waitFor(() => {
      expect(data).toEqual([
        { label: "Messenger Inbox", value: "inbox-messenger" },
      ])
    })
  })

  test("useSmtpInboxOptions drops an smtp inbox row with no linked SMTP integration", async () => {
    renderProbe(<SmtpInboxOptionsProbe onData={(next) => (data = next)} />)

    await vi.waitFor(() => {
      expect(data).toEqual([
        { label: "Support Email", value: "smtp-integration-1" },
      ])
    })
  })

  test("useSmtpInboxFromAddressMap keys the from-address by the SMTP integration id", async () => {
    renderProbe(
      <SmtpInboxFromAddressMapProbe onData={(next) => (data = next)} />,
    )

    await vi.waitFor(() => {
      expect(data).toEqual({ "smtp-integration-1": "support@example.com" })
    })
  })
})
