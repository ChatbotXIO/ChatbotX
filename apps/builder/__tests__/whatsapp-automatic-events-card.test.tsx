// @vitest-environment jsdom

import type { WhatsappCredentialPublic } from "@chatbotx.io/database/partials"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { WhatsappAutomaticEventsCard } from "@/features/integration-whatsapp/components/whatsapp-automatic-events-card"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: vi.fn(), isPending: false }),
}))

vi.mock("@/features/integration-whatsapp/actions/reconnect.action", () => ({
  reconnectWhatsappAction: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

const baseIntegration = {
  id: "iw-1",
  name: "Hung Ban Hang",
  displayPhoneNumber: "84339426550",
  wabaId: "1303031825154214",
  hasCapiScope: true,
}

const whatsappCredentialPublic: WhatsappCredentialPublic = {
  clientId: "client-1",
  version: "v23.0",
  configId: "config-1",
  systemUserId: "su-1",
  businessId: "biz-1",
  businessName: "Biz",
  verifyToken: "verify",
}

describe("WhatsappAutomaticEventsCard", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
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

  function renderCard(
    integration: typeof baseIntegration,
    credential: WhatsappCredentialPublic | null,
  ) {
    act(() => {
      root.render(
        <WhatsappAutomaticEventsCard
          integrationWhatsapp={integration}
          whatsappCredentialPublic={credential}
          workspaceId="ws-1"
        />,
      )
    })
  }

  function findReconnectButton(): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent.includes("ads.connectAccounts.reconnect"),
    )
  }

  test("shows the ready status without a reconnect button", () => {
    renderCard(baseIntegration, whatsappCredentialPublic)

    expect(container.textContent).toContain(
      "whatsapp.capi.automaticEvents.title",
    )
    expect(container.textContent).toContain("ads.connectAccounts.status.ready")
    expect(findReconnectButton()).toBeUndefined()
  })

  test("shows an enabled reconnect button when the permission is missing", () => {
    renderCard(
      { ...baseIntegration, hasCapiScope: false },
      whatsappCredentialPublic,
    )

    expect(container.textContent).toContain(
      "ads.connectAccounts.status.missingPermission",
    )
    const button = findReconnectButton()
    expect(button).toBeDefined()
    expect(button?.disabled).toBe(false)
  })

  test("shows the unverified status when no credential is configured", () => {
    renderCard({ ...baseIntegration, hasCapiScope: false }, null)

    expect(container.textContent).toContain(
      "ads.connectAccounts.status.unverified",
    )
    expect(findReconnectButton()).toBeUndefined()
  })
})
