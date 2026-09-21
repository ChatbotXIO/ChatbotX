import type { ReactNode } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { BroadcastResourceWithRelations } from "@/features/broadcasts/schema/resource"

const { mockListTemplateDetails } = vi.hoisted(() => ({
  mockListTemplateDetails: vi.fn(),
}))

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ number: (value: number) => String(value) }),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    broadcastAPIs: {
      privateListBroadcastTemplateDetailsAPI: mockListTemplateDetails,
    },
  },
}))

vi.mock("@/hooks/routing", () => ({ useWorkspaceId: () => "ws-1" }))

vi.mock("@chatbotx.io/ui/components/ui/dialog", () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  )
  return {
    Dialog: Passthrough,
    DialogContent: Passthrough,
    DialogHeader: Passthrough,
    DialogTitle: Passthrough,
  }
})

vi.mock("@/features/contact-filter/components/contact-filter-summary", () => ({
  ContactFilterSummary: () => null,
}))

vi.mock("@/features/inboxes/components/inbox-icon", () => ({
  InboxIcon: ({ label }: { label: string }) => <span>{label}</span>,
}))

vi.mock(
  "@/features/integration-messenger/message-templates/components/template-preview",
  () => ({
    // A template whose stored components cannot render throws, like a
    // malformed synced template would.
    MessengerTemplatePreview: ({
      components,
    }: {
      components: Array<{ type?: string }>
    }) => {
      if (components[0]?.type === "BROKEN") {
        throw new Error("malformed template")
      }
      return <div>messenger-preview</div>
    },
  }),
)

vi.mock(
  "@/features/integration-whatsapp/message-templates/components/template-preview",
  () => ({ TemplatePreview: () => <div>whatsapp-preview</div> }),
)

const { BroadcastDetailDialog } = await import(
  "@/features/broadcasts/broadcast-detail-dialog"
)

const BASE_BROADCAST = {
  id: "b-1",
  name: "Launch",
  channel: "messenger",
  subaction: "sendMessageTag",
  status: "draft",
  schedulesType: "now",
  schedulesAt: new Date("2026-09-18T00:00:00Z"),
  contactCount: 10,
  contactFilter: null,
  flowId: null,
  templateId: null,
  templateData: null,
  flow: null,
  integrationMessenger: null,
  integrationWhatsapp: null,
} as unknown as BroadcastResourceWithRelations

const target = (inboxId: string, pageName: string, extra: object = {}) => ({
  inboxId,
  flowId: null,
  templateId: null,
  templateData: null,
  inbox: { id: inboxId, name: pageName },
  flow: null,
  ...extra,
})

describe("BroadcastDetailDialog — per-page targets", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    mockListTemplateDetails.mockResolvedValue([])
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const renderDialog = async (broadcast: BroadcastResourceWithRelations) => {
    await act(async () => {
      root.render(
        <BroadcastDetailDialog
          broadcast={broadcast}
          onOpenChange={() => undefined}
          open={true}
        />,
      )
      // Flush the template-details request the dialog starts on open.
      await Promise.resolve()
    })
    return container.textContent ?? ""
  }

  const flowLinks = () =>
    Array.from(container.querySelectorAll("a")).map((link) => ({
      name: link.textContent,
      href: link.getAttribute("href"),
    }))

  test("lists every target page and the flow each page runs", async () => {
    const text = await renderDialog({
      ...BASE_BROADCAST,
      targets: [
        target("inbox-a", "Page A", {
          flowId: "flow-1",
          flow: { id: "flow-1", name: "Welcome flow" },
        }),
        target("inbox-b", "Page B", {
          flowId: "flow-2",
          flow: { id: "flow-2", name: "Promo flow" },
        }),
      ],
    } as BroadcastResourceWithRelations)

    expect(text).toContain("Page A, Page B")
    // Pages are named like the create form's page picker does.
    expect(text).toContain("fields.messengerChannels.label")
    expect(flowLinks()).toEqual([
      { name: "Welcome flow", href: "/space/ws-1/flows/flow-1" },
      { name: "Promo flow", href: "/space/ws-1/flows/flow-2" },
    ])
    // A flow broadcast has no template section at all.
    expect(text).not.toContain("messages.featureNotFound")
    expect(mockListTemplateDetails).not.toHaveBeenCalled()
  })

  test("loads the per-page templates of a template broadcast sent from targets", async () => {
    await renderDialog({
      ...BASE_BROADCAST,
      targets: [
        target("inbox-a", "Page A", { templateId: "tmpl-a" }),
        target("inbox-b", "Page B", { templateId: "tmpl-b" }),
      ],
    } as BroadcastResourceWithRelations)

    expect(mockListTemplateDetails).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      broadcastId: "b-1",
    })
  })

  test("collapses each page's template preview until the user expands it", async () => {
    mockListTemplateDetails.mockResolvedValue([
      {
        id: "tmpl-a",
        channel: "messenger",
        name: "temp_09",
        language: "en",
        category: "UTILITY",
        status: "APPROVED",
        parameterFormat: "POSITIONAL",
        components: [{ type: "BODY", text: "Hello" }],
        inboxId: "inbox-a",
        integrationName: "Page A",
      },
    ])

    const text = await renderDialog({
      ...BASE_BROADCAST,
      targets: [target("inbox-a", "Page A", { templateId: "tmpl-a" })],
    } as BroadcastResourceWithRelations)

    expect(text).toContain("temp_09 (en)")
    expect(text).not.toContain("messenger-preview")
    expect(flowLinks()).toEqual([])

    const trigger = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("flows.fields.preview"),
    )
    await act(async () => {
      trigger?.click()
      await Promise.resolve()
    })

    expect(container.textContent).toContain("messenger-preview")
  })

  test("names WhatsApp pages with the WhatsApp label in the flow list", async () => {
    const text = await renderDialog({
      ...BASE_BROADCAST,
      channel: "whatsapp",
      targets: [
        target("inbox-w", "WA number", {
          flowId: "flow-w",
          flow: { id: "flow-w", name: "WA flow" },
        }),
      ],
    } as BroadcastResourceWithRelations)

    expect(text).toContain("fields.whatsappChannels.label")
    expect(text).not.toContain("fields.messengerChannels.label")
    expect(flowLinks()).toEqual([
      { name: "WA flow", href: "/space/ws-1/flows/flow-w" },
    ])
  })

  test("shows a WhatsApp page's template with the WhatsApp preview", async () => {
    mockListTemplateDetails.mockResolvedValue([
      {
        id: "tmpl-w",
        channel: "whatsapp",
        name: "address_update",
        language: "en",
        category: "UTILITY",
        status: "APPROVED",
        parameterFormat: "POSITIONAL",
        components: [{ type: "BODY", text: "Hello" }],
        inboxId: "inbox-w",
        integrationName: "WA number",
      },
    ])

    const text = await renderDialog({
      ...BASE_BROADCAST,
      channel: "whatsapp",
      targets: [target("inbox-w", "WA number", { templateId: "tmpl-w" })],
    } as BroadcastResourceWithRelations)

    expect(text).toContain("address_update (en)")
    expect(text).toContain("fields.whatsappChannels.label")

    const trigger = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("flows.fields.preview"),
    )
    await act(async () => {
      trigger?.click()
      await Promise.resolve()
    })

    expect(container.textContent).toContain("whatsapp-preview")
    expect(container.textContent).not.toContain("messenger-preview")
  })

  test("says the template is not found when the chosen template no longer exists", async () => {
    mockListTemplateDetails.mockResolvedValue([])

    const text = await renderDialog({
      ...BASE_BROADCAST,
      channel: "whatsapp",
      targets: [target("inbox-w", "WA number", { templateId: "deleted" })],
    } as BroadcastResourceWithRelations)

    expect(text).toContain("messages.featureNotFound")
    expect(flowLinks()).toEqual([])
  })

  test("marks only the page whose template was deleted as not found", async () => {
    mockListTemplateDetails.mockResolvedValue([
      {
        id: "tmpl-a",
        channel: "messenger",
        name: "temp_09",
        language: "en",
        category: "UTILITY",
        status: "APPROVED",
        parameterFormat: "POSITIONAL",
        components: [{ type: "BODY", text: "Hello" }],
        inboxId: "inbox-a",
        integrationName: "Page A",
      },
    ])

    const text = await renderDialog({
      ...BASE_BROADCAST,
      targets: [
        target("inbox-a", "Page A", { templateId: "tmpl-a" }),
        target("inbox-b", "Page B", { templateId: "tmpl-deleted" }),
      ],
    } as BroadcastResourceWithRelations)

    expect(text).toContain("temp_09 (en)")
    expect(text).toContain("Page B")
    expect(text).toContain("messages.featureNotFound")
  })

  test("shows a load error, not 'not found', when the request fails", async () => {
    mockListTemplateDetails.mockRejectedValue(new Error("network down"))

    const text = await renderDialog({
      ...BASE_BROADCAST,
      targets: [target("inbox-a", "Page A", { templateId: "tmpl-a" })],
    } as BroadcastResourceWithRelations)

    expect(text).toContain("messages.errorLoadingData")
    expect(text).not.toContain("messages.featureNotFound")
    // The rest of the dialog still renders.
    expect(text).toContain("Launch")
  })

  test("a template preview that fails to render never breaks the dialog", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
    mockListTemplateDetails.mockResolvedValue([
      {
        id: "tmpl-a",
        channel: "messenger",
        name: "temp_broken",
        language: "en",
        category: "UTILITY",
        status: "APPROVED",
        parameterFormat: "POSITIONAL",
        components: [{ type: "BROKEN" }],
        inboxId: "inbox-a",
        integrationName: "Page A",
      },
    ])

    await renderDialog({
      ...BASE_BROADCAST,
      targets: [target("inbox-a", "Page A", { templateId: "tmpl-a" })],
    } as BroadcastResourceWithRelations)

    const trigger = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("flows.fields.preview"),
    )
    await act(async () => {
      trigger?.click()
      await Promise.resolve()
    })

    expect(container.textContent).toContain("messages.errorLoadingData")
    expect(container.textContent).toContain("temp_broken (en)")
    expect(container.textContent).toContain("Launch")
    consoleError.mockRestore()
  })

  test("keeps showing a legacy single-page broadcast from its own columns", async () => {
    const text = await renderDialog({
      ...BASE_BROADCAST,
      flowId: "flow-legacy",
      flow: { id: "flow-legacy", name: "Legacy flow" },
      integrationMessenger: { id: "im-1", name: "Legacy page" },
      targets: [],
    } as unknown as BroadcastResourceWithRelations)

    expect(text).toContain("Legacy page")
    expect(flowLinks()).toEqual([
      { name: "Legacy flow", href: "/space/ws-1/flows/flow-legacy" },
    ])
  })

  test("shows a dash when a flow broadcast has no flow picked yet", async () => {
    const text = await renderDialog({
      ...BASE_BROADCAST,
      targets: [target("inbox-a", "Page A")],
    } as BroadcastResourceWithRelations)

    expect(text).toContain("fields.flow.label")
    expect(flowLinks()).toEqual([])
  })

  test("omits the send limit detail row when no limit is stored", async () => {
    const text = await renderDialog({
      ...BASE_BROADCAST,
      targets: [target("inbox-a", "Page A")],
      audienceRangeStart: null,
      audienceRangeEnd: null,
      sendRatePerMinute: null,
    } as BroadcastResourceWithRelations)

    expect(text).not.toContain("broadcasts.detail.sendLimit")
  })

  test("shows the send limit detail row when a range or rate is stored", async () => {
    const text = await renderDialog({
      ...BASE_BROADCAST,
      targets: [target("inbox-a", "Page A")],
      audienceRangeStart: 1,
      audienceRangeEnd: 20_000,
      sendRatePerMinute: 100,
    } as BroadcastResourceWithRelations)

    expect(text).toContain("broadcasts.detail.sendLimit")
    expect(text).toContain("broadcasts.sendLimit.rangeSummary")
    expect(text).toContain("broadcasts.sendLimit.rateSummary")
  })
})
