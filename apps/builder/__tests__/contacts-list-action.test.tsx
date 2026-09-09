import type { Table } from "@tanstack/react-table"
import type { ReactElement, ReactNode } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { ContactListAction } from "@/features/contacts/contacts-list-action"
import type { ContactResponse } from "@/features/contacts/schema/query"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: ReactNode
    href: string
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

let inboxes: { channel: string }[] = []
vi.mock("@/features/inboxes/provider/inbox-store-context", () => ({
  useInboxStore: (
    selector: (state: { inboxes: { channel: string }[] }) => unknown,
  ) => selector({ inboxes }),
}))

// No portal/open-state machinery — always renders every menu item, which is
// exactly what this test needs to assert on (unlike the trigger interaction,
// menu-content presence/wiring is not base-ui behavior under test here).
vi.mock("@chatbotx.io/ui/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    render,
    onClick,
  }: {
    children?: ReactNode
    render?: ReactElement
    onClick?: (event: { preventDefault: () => void }) => void
  }) =>
    render ? (
      render
    ) : (
      <button onClick={onClick as never} type="button">
        {children}
      </button>
    ),
  DropdownMenuPortal: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSub: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSubContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSubTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ render }: { render?: ReactElement }) =>
    render ?? null,
}))

// This file only asserts `ContactListAction`'s own wiring (which triggers
// render, the Import submenu's two options, the scan trigger's visibility) —
// every child dialog is stubbed to just render its `trigger` prop so none of
// their business-logic/query dependencies are pulled in. `vi.hoisted` because
// every `vi.mock(...)` factory below is hoisted above this module's own
// top-level statements.
const { passthroughTrigger } = vi.hoisted(() => ({
  passthroughTrigger: ({ trigger }: { trigger: ReactElement }) => trigger,
}))

vi.mock("@/features/conversations/components/archive-conversation", () => ({
  default: passthroughTrigger,
}))
vi.mock(
  "@/features/conversations/components/assign-conversation-dialog",
  () => ({
    default: passthroughTrigger,
  }),
)
vi.mock("@/features/conversations/components/disable-bot-dialog", () => ({
  default: passthroughTrigger,
}))
vi.mock("@/features/conversations/components/enable-bot-dialog", () => ({
  default: passthroughTrigger,
}))
vi.mock("@/features/contacts/components/add-contact-sequence-dialog", () => ({
  default: passthroughTrigger,
}))
vi.mock("@/features/contacts/components/add-contact-tag-dialog", () => ({
  default: passthroughTrigger,
}))
vi.mock("@/features/contacts/components/add-custom-field-dialog", () => ({
  default: passthroughTrigger,
}))
vi.mock("@/features/contacts/components/delete-contact-custom-field", () => ({
  default: passthroughTrigger,
}))
vi.mock("@/features/contacts/components/remove-contact-dialog", () => ({
  default: passthroughTrigger,
}))
vi.mock(
  "@/features/contacts/components/remove-contact-sequence-dialog",
  () => ({
    default: passthroughTrigger,
  }),
)
vi.mock("@/features/contacts/components/remove-contact-tag-dialog", () => ({
  default: passthroughTrigger,
}))
vi.mock("@/features/contacts/export-contact-dialog", () => ({
  ExportContactDialog: passthroughTrigger,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

function render() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  const table = {
    getFilteredSelectedRowModel: () => ({ rows: [] }),
    getIsAllPageRowsSelected: () => false,
  } as unknown as Table<ContactResponse>
  act(() => {
    root?.render(<ContactListAction table={table} workspaceId="ws-1" />)
  })
  // biome-ignore lint/style/noNonNullAssertion: assigned synchronously above
  return container!
}

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount()
    })
  }
  container?.remove()
  container = null
  root = null
  inboxes = []
})

describe("ContactListAction — Import submenu", () => {
  test("renders both Import options when the workspace has a contact-scan-eligible inbox", () => {
    inboxes = [{ channel: "messenger" }]
    const el = render()

    expect(el.textContent).toContain("contactScan.menu.importFromFile")
    expect(el.textContent).toContain("contactScan.menu.automaticScan")
  })

  test("the file option links to the contacts import page", () => {
    inboxes = [{ channel: "messenger" }]
    const el = render()

    const link = Array.from(el.querySelectorAll("a")).find(
      (a) => a.textContent === "contactScan.menu.importFromFile",
    )
    expect(link?.getAttribute("href")).toBe("/space/ws-1/contacts/import")
  })

  test("the automatic scan option links to the contacts scan page", () => {
    inboxes = [{ channel: "messenger" }]
    const el = render()

    const link = Array.from(el.querySelectorAll("a")).find(
      (a) => a.textContent === "contactScan.menu.automaticScan",
    )
    expect(link?.getAttribute("href")).toBe("/space/ws-1/contacts/scan")
  })

  test("hides the Automatic Customer Scan option when no inbox supports it", () => {
    inboxes = [{ channel: "whatsapp" }, { channel: "webchat" }]
    const el = render()

    expect(el.textContent).toContain("contactScan.menu.importFromFile")
    expect(el.textContent).not.toContain("contactScan.menu.automaticScan")
  })

  test("hides the Automatic Customer Scan option when the workspace has no inboxes at all", () => {
    inboxes = []
    const el = render()

    expect(el.textContent).not.toContain("contactScan.menu.automaticScan")
  })
})
