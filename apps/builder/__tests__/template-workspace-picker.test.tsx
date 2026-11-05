// @vitest-environment jsdom

import { NextIntlClientProvider } from "next-intl"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import messages from "../messages/en.json"

const mocks = vi.hoisted(() => ({ execute: vi.fn() }))

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: unknown; href: string }) => (
    <a href={href}>{children as never}</a>
  ),
}))
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: mocks.execute, isPending: false }),
}))
vi.mock("@/features/templates/actions/install-template.action", () => ({
  installTemplateAction: { bind: () => vi.fn() },
}))
vi.mock("@/features/templates/components/install-collision-summary", () => ({
  InstallCollisionSummary: () => null,
}))

const { WorkspacePicker } = await import(
  "@/features/templates/components/workspace-picker"
)

describe("WorkspacePicker publisher access", () => {
  let container: HTMLDivElement
  let root: Root

  const render = (crossTenant: boolean) =>
    act(() =>
      root.render(
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <WorkspacePicker
            inboxOptions={{}}
            installedCopies={{}}
            requiredInboxes={[]}
            shareToken="tok"
            workspaces={[
              { id: "ws-1", name: "Mine", logoUrl: null, crossTenant },
            ]}
          />
        </NextIntlClientProvider>,
      ),
    )
  const installIn = (scope: ParentNode) =>
    Array.from(scope.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === "Install",
    )
  const openPopup = () => act(() => installIn(container)?.click())
  const install = () =>
    installIn(document.querySelector("[role=dialog]") as ParentNode)

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("a same-tenant install grants the publisher access, with nothing to choose", () => {
    render(false)
    openPopup()

    act(() => install()?.click())

    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({ acceptPublisherUninstall: true }),
    )
  })

  test("a cross-tenant install never sends it as granted", () => {
    render(true)
    openPopup()

    act(() => install()?.click())

    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({ acceptPublisherUninstall: false }),
    )
  })
})
