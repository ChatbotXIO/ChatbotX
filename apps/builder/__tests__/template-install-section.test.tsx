// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listByUserId: vi.fn(),
  findInboxManifestByShareToken: vi.fn(),
  filterInstallableWorkspaces: vi.fn(),
  listBindableInboxes: vi.fn(),
  listInstalledCopies: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceMemberService: { listByUserId: mocks.listByUserId },
  templateInstallationRequestService: {
    findInboxManifestByShareToken: mocks.findInboxManifestByShareToken,
    filterInstallableWorkspaces: mocks.filterInstallableWorkspaces,
    listBindableInboxes: mocks.listBindableInboxes,
    listInstalledCopies: mocks.listInstalledCopies,
  },
}))
vi.mock("@chatbotx.io/utils", () => ({
  getPublicFileUrl: (path: string) => path,
}))
vi.mock("@/features/tenant/utils", () => ({
  getTenantSettings: () => Promise.resolve({ storageUrl: "https://s.test" }),
}))
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}))
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: unknown; href: string }) => (
    <a href={href}>{children as never}</a>
  ),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ executeAsync: vi.fn(), isPending: false }),
}))
vi.mock("@/features/templates/actions/template-install-intent.action", () => ({
  rememberTemplateInstallIntentAction: vi.fn(),
}))
vi.mock("@/features/templates/components/workspace-picker", () => ({
  WorkspacePicker: () => <div data-testid="picker" />,
}))

const { InstallSection } = await import(
  "@/features/templates/components/public-install-section"
)

describe("public install section", () => {
  let container: HTMLDivElement
  let root: Root

  const render = async () => {
    const element = await InstallSection({ shareToken: "tok", userId: "u-1" })
    act(() => root.render(element))
  }
  const createLink = () =>
    container.querySelector<HTMLAnchorElement>("a[href^='/channels/create']")

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    mocks.listByUserId.mockResolvedValue([])
    mocks.findInboxManifestByShareToken.mockResolvedValue([])
    mocks.listBindableInboxes.mockResolvedValue({})
    mocks.listInstalledCopies.mockResolvedValue({})
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("offers a new workspace next to the picker", async () => {
    mocks.filterInstallableWorkspaces.mockResolvedValue([
      { id: "ws-1", name: "Mine", tenantId: "1" },
    ])

    await render()

    expect(container.querySelector("[data-testid='picker']")).not.toBeNull()
    expect(createLink()?.textContent).toBe("createWorkspace")
  })

  test("offers a new workspace when none is eligible, instead of a dead end", async () => {
    mocks.filterInstallableWorkspaces.mockResolvedValue([])

    await render()

    expect(container.textContent).toContain("noEligibleWorkspaces")
    expect(container.querySelector("[data-testid='picker']")).toBeNull()
    expect(createLink()).not.toBeNull()
  })
})
