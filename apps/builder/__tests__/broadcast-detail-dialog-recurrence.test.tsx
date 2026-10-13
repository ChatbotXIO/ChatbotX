import type { ReactNode } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { BroadcastResourceWithRelations } from "@/features/broadcasts/schema/resource"

/** Echoes the key back; `rich` renders the key then the link chunk. */
vi.mock("next-intl", () => {
  const translate = Object.assign((key: string) => key, {
    rich: (
      key: string,
      values: {
        name: string
        link: (chunks: ReactNode) => ReactNode
      },
    ) => (
      <span data-testid="rich">
        {key}:{values.link(values.name)}
      </span>
    ),
  })
  return {
    useTranslations: () => translate,
    useFormatter: () => ({ number: (value: number) => String(value) }),
  }
})

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    broadcastAPIs: {
      privateListBroadcastTemplateDetailsAPI: vi.fn().mockResolvedValue([]),
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
vi.mock("@/components/recurrence/recurrence-summary", () => ({
  RecurrenceSummary: ({ rule }: { rule: { timezone: string } }) => (
    <div data-testid="recurrence-summary">{rule.timezone}</div>
  ),
}))

const { BroadcastDetailDialog } = await import(
  "@/features/broadcasts/broadcast-detail-dialog"
)

const RULE = {
  frequency: "daily",
  interval: 1,
  timeOfDay: "09:00",
  timezone: "Asia/Ho_Chi_Minh",
  startsOn: "2026-10-14",
  end: { kind: "never" },
}

const BASE = {
  id: "b-1",
  name: "Daily digest",
  channel: "omnichannel",
  subaction: "allContacts",
  status: "recurring",
  schedulesType: "recurring",
  occurrenceAt: null,
  schedulesAt: new Date("2026-10-16T02:00:00Z"),
  contactCount: null,
  contactFilter: null,
  flowId: null,
  templateId: null,
  templateData: null,
  flow: null,
  integrationMessenger: null,
  integrationWhatsapp: null,
  recurrence: { id: "r-1", rule: RULE },
} as unknown as BroadcastResourceWithRelations

describe("BroadcastDetailDialog — repeating broadcasts", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
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
      await Promise.resolve()
    })
  }

  test("a series shows its schedule and links to its runs", async () => {
    await renderDialog(BASE)

    expect(
      container.querySelector('[data-testid="recurrence-summary"]')
        ?.textContent,
    ).toBe("Asia/Ho_Chi_Minh")
    expect(container.textContent).toContain("broadcasts.detail.schedule")
    expect(
      container.querySelector<HTMLAnchorElement>(
        'a[href="/space/ws-1/broadcasts/b-1/runs"]',
      )?.textContent,
    ).toBe("actions.viewRuns")
  })

  test("a series reads Repeating, not a send status", async () => {
    await renderDialog(BASE)

    expect(container.textContent).toContain("broadcasts.status.recurring")
    expect(container.textContent).toContain("fields.schedule.recurring")
  })

  test("a paused series reads Paused", async () => {
    await renderDialog({ ...BASE, status: "cancelled" })

    expect(container.textContent).toContain("broadcasts.status.paused")
  })

  test("a run links back to the series that created it", async () => {
    await renderDialog({
      ...BASE,
      id: "run-1",
      schedulesType: "future",
      status: "sent",
      occurrenceAt: new Date("2026-10-15T02:00:00Z"),
      recurrence: null,
      parent: { id: "b-1", name: "Daily digest" },
    } as BroadcastResourceWithRelations)

    expect(
      container.querySelector('[data-testid="recurrence-summary"]'),
    ).toBeNull()
    expect(
      container.querySelector('[data-testid="rich"]')?.textContent,
    ).toContain("broadcasts.detail.runOf")
    expect(
      container.querySelector('a[href="/space/ws-1/broadcasts/b-1/runs"]')
        ?.textContent,
    ).toBe("Daily digest")
  })

  test("a one-off shows neither", async () => {
    await renderDialog({
      ...BASE,
      schedulesType: "future",
      status: "scheduled",
      recurrence: null,
    } as BroadcastResourceWithRelations)

    expect(
      container.querySelector('[data-testid="recurrence-summary"]'),
    ).toBeNull()
    expect(container.querySelector('[data-testid="rich"]')).toBeNull()
    expect(container.querySelector('a[href$="/runs"]')).toBeNull()
  })
})
