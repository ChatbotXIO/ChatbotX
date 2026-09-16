import type { ListInboxesResponse } from "@chatbotx.io/business"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { InboxCardList } from "@/features/inboxes/components/inbox-card-list"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@/features/tenant", () => ({
  useTenantSettings: () => ({ appUrl: "https://app.test" }),
}))

vi.mock("@/features/qr-codes/scan-qrcode", () => ({
  ScanQRCodeDialog: ({ link }: { link: string }) => <span>qr:{link}</span>,
}))

vi.mock("@/features/inboxes/components/inbox-new-card", () => ({
  default: () => null,
}))

type Inbox = ListInboxesResponse["data"][number]

const buildInbox = (overrides: Partial<Inbox>): Inbox =>
  ({
    id: "1",
    workspaceId: "1",
    name: "inbox",
    sourceId: "source-1",
    channel: "messenger",
    ...overrides,
  }) as Inbox

describe("InboxCardList", () => {
  let container: HTMLDivElement
  let root: Root

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  const render = (inboxes: Inbox[]) => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    act(() => {
      root.render(
        <InboxCardList allowAddNew={false} inboxes={inboxes} workspaceId="1" />,
      )
    })
  }

  test("renders a card for channels that have no public chat link", () => {
    render([
      buildInbox({ id: "10", name: "Threads Account", channel: "threads" }),
    ])

    expect(container.textContent).toContain("Threads Account")
    expect(container.textContent).not.toContain("qr:")
  })

  test("still renders the QR action for channels that have a link", () => {
    render([buildInbox({ id: "11", name: "Page", channel: "messenger" })])

    expect(container.textContent).toContain("Page")
    expect(container.textContent).toContain("qr:https://m.me/source-1")
  })
})
