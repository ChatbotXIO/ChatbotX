import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const { mockListPreview } = vi.hoisted(() => ({
  mockListPreview: vi.fn().mockResolvedValue({ data: [] }),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    contactsAPIs: {
      listContactInboxesAudiencePreviewAuthenticatedAPI: mockListPreview,
    },
  },
}))

vi.mock("@/features/common/components/stats-contacts-dialog", () => ({
  StatsContactsDialog: ({
    fetchPage,
  }: {
    fetchPage: (page: number, perPage: number) => Promise<unknown>
  }) => {
    // Simulate the dialog requesting the first page, like the real
    // component does once it mounts open.
    fetchPage(1, 20).catch(() => undefined)
    return <div data-testid="stats-contacts-dialog" />
  },
}))

const { BroadcastAudiencePreviewDialog } = await import(
  "@/features/broadcasts/components/broadcast-audience-preview-dialog"
)

describe("BroadcastAudiencePreviewDialog send limit forwarding", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    mockListPreview.mockResolvedValue({ data: [] })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = (
    props: Partial<{
      audienceRangeStart: number | null
      audienceRangeEnd: number | null
    }>,
  ) =>
    act(async () => {
      root.render(
        <BroadcastAudiencePreviewDialog
          channel="telegram"
          onOpenChange={() => undefined}
          open={true}
          subaction="telegramAllContacts"
          total={10}
          workspaceId="ws-1"
          {...props}
        />,
      )
      await Promise.resolve()
    })

  test("forwards audienceRangeStart and audienceRangeEnd to the preview API call", async () => {
    await render({ audienceRangeStart: 5, audienceRangeEnd: 100 })

    expect(mockListPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        audienceRangeStart: 5,
        audienceRangeEnd: 100,
      }),
    )
  })

  test("omits the range fields when neither bound is set", async () => {
    await render({})

    const call = mockListPreview.mock.calls[0]?.[0] as Record<string, unknown>
    expect(call.audienceRangeStart).toBeUndefined()
    expect(call.audienceRangeEnd).toBeUndefined()
  })
})
