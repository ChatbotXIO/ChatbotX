// @vitest-environment jsdom

import { NextIntlClientProvider } from "next-intl"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import messages from "../messages/en.json"

const handleCopy = vi.hoisted(() => vi.fn())

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: unknown; href: string }) => (
    <a href={href}>{children as never}</a>
  ),
}))
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: vi.fn(), isPending: false }),
}))
vi.mock("@/features/tenant", () => ({
  useTenantSettings: () => ({ appUrl: "https://app.test" }),
}))
vi.mock("@/hooks/use-clipboard", () => ({
  useClipboard: () => ({ handleCopy }),
}))
vi.mock("@/features/templates/actions/rotate-share-token.action", () => ({
  rotateShareTokenAction: { bind: () => vi.fn() },
}))
vi.mock("@/features/templates/actions/update-share-settings.action", () => ({
  updateShareSettingsAction: { bind: () => vi.fn() },
}))
vi.mock("@/features/templates/actions/retry-installation.action", () => ({
  retryInstallationAction: { bind: () => vi.fn() },
}))
vi.mock("@/features/templates/lib/use-refreshing-action", () => ({
  useRefreshingAction: () => ({ execute: vi.fn(), isPending: false }),
}))
vi.mock("@/features/templates/components/install-progress-refresher", () => ({
  InstallProgressRefresher: () => null,
}))
vi.mock(
  "@/features/templates/components/template-installation-sync-card",
  () => ({
    TemplateInstallationSyncCard: () => null,
  }),
)
vi.mock("@/features/templates/components/uninstalled-notice", () => ({
  UninstalledNotice: () => null,
}))

const { ShareSettingsPanel } = await import(
  "@/features/templates/components/share-settings-panel"
)
const { TemplateInstallationDetail } = await import(
  "@/features/templates/components/template-installation-detail"
)

describe("template share credentials and install source", () => {
  let container: HTMLDivElement
  let root: Root

  const renderWithIntl = (node: React.ReactNode) =>
    act(() => {
      root.render(
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          {node}
        </NextIntlClientProvider>,
      )
    })
  const input = (id: string) =>
    container.querySelector<HTMLInputElement>(`#${id}`)

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    // base-ui's Switch builds a PointerEvent on click, which jsdom lacks.
    if (!window.PointerEvent) {
      Object.assign(window, { PointerEvent: MouseEvent })
    }
    vi.clearAllMocks()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  describe("share panel", () => {
    const template = (shareEnabled: boolean) => ({
      id: "55",
      shareEnabled,
      shareToken: "secret-token",
      shareExpiresAt: null,
    })

    test("shows the template id and a masked key next to the link", () => {
      renderWithIntl(
        <ShareSettingsPanel
          shareUrl="https://app.test/t/tok"
          template={template(true)}
          workspaceId="ws-1"
        />,
      )

      expect(input("template-share-id")?.value).toBe("55")
      expect(input("template-share-id")?.type).toBe("text")
      expect(input("template-share-key")?.value).toBe("secret-token")
      expect(input("template-share-key")?.type).toBe("password")
    })

    test("reveals the key on request and copies the raw values", () => {
      renderWithIntl(
        <ShareSettingsPanel
          shareUrl="https://app.test/t/tok"
          template={template(true)}
          workspaceId="ws-1"
        />,
      )

      act(() =>
        container
          .querySelector<HTMLButtonElement>("button[aria-label='Show key']")
          ?.click(),
      )
      expect(input("template-share-key")?.type).toBe("text")
      expect(
        container.querySelector("button[aria-label='Hide key']"),
      ).not.toBeNull()

      const copyLabel = (field: string) =>
        messages.templates.share.copyField.replace("{field}", field)
      const copyKey = container.querySelector<HTMLButtonElement>(
        `button[aria-label='${copyLabel(messages.templates.share.templateKey)}']`,
      )
      expect(
        container.querySelector(
          `button[aria-label='${copyLabel(messages.templates.share.templateId)}']`,
        ),
      ).not.toBeNull()
      act(() => copyKey?.click())
      expect(handleCopy).toHaveBeenCalledWith("secret-token")
    })

    test("hides the id and key while sharing is off", () => {
      renderWithIntl(
        <ShareSettingsPanel
          shareUrl="https://app.test/t/tok"
          template={template(false)}
          workspaceId="ws-1"
        />,
      )

      expect(input("template-share-id")).toBeNull()
      expect(input("template-share-key")).toBeNull()
    })
  })

  describe("installation detail", () => {
    type Detail = Parameters<typeof TemplateInstallationDetail>[0]["detail"]

    const detail = (over: Partial<Detail>): Detail => ({
      id: "201",
      templateName: "Starter",
      status: "completed",
      errorCode: null,
      resourceCount: 0,
      warningCount: 0,
      attempts: 1,
      claimedAt: null,
      autoUpdate: false,
      sourceVersion: 1,
      updateAvailable: false,
      sourceDeleted: false,
      lastSyncedAt: null,
      syncInProgress: false,
      publisherUninstallGrant: false,
      installedByName: null,
      installSource: "manual",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      completedAt: null,
      warnings: [],
      warningSummary: [],
      warningGroups: [],
      installerWarningCount: 0,
      resourceSummary: [],
      uninstallState: "none",
      uninstallErrorCode: null,
      uninstallCounts: null,
      uninstall: null,
      ...over,
    })

    const renderDetail = (over: Partial<Detail>) =>
      renderWithIntl(
        <TemplateInstallationDetail
          activeCategory={undefined}
          detail={detail(over)}
          history={[]}
          resources={{ items: [], nextCursor: null }}
          workspaceId="ws-1"
        />,
      )

    test("labels a white-label default install as automatic, not as an API token", () => {
      renderDetail({ installSource: "tenantDefault" })

      expect(container.textContent).toContain(
        "Installed automatically (white-label default)",
      )
      expect(container.textContent).not.toContain("API token")
    })

    test("names the member who retried an automatic install instead of hiding them", () => {
      renderDetail({ installSource: "tenantDefault", installedByName: "Dana" })

      expect(container.textContent).toContain("Dana")
      expect(container.textContent).not.toContain("Installed automatically")
    })

    test("keeps the installer name for a manual install and the API label for a tokenless one", () => {
      renderDetail({ installedByName: "Dana" })
      expect(container.textContent).toContain("Dana")

      renderDetail({ installedByName: null })
      expect(container.textContent).not.toContain("Installed automatically")
      expect(container.textContent).toContain(
        messages.templates.installs.viaApi,
      )
    })
  })
})
