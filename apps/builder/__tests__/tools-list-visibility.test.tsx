// @vitest-environment jsdom

import type { WorkspaceMemberPermissions } from "@chatbotx.io/database/partials"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ToolsList } from "@/features/tools/tools-list"

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push }),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "ws1",
}))

/**
 * The `permissions` jsonb column defaults to `{}` at runtime even though
 * `WorkspaceMemberPermissions` declares every flag required — mirrors the
 * cast used in `tools-list-config.test.ts` so these render tests exercise
 * the same partial-object runtime shape without weakening type safety.
 */
const permissions = (
  value: Partial<WorkspaceMemberPermissions>,
): WorkspaceMemberPermissions => value as WorkspaceMemberPermissions

const fullPermissions: WorkspaceMemberPermissions = {
  superAdmin: true,
  analytics: true,
  flows: true,
  contacts: true,
  onlyAssignedContacts: true,
  emailAndPhone: true,
  broadcast: true,
  ecommerce: true,
}

describe("ToolsList — permission gating for the click-to-message-ads card", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    navigation.push.mockClear()
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

  test("renders the click-to-message-ads card when superAdmin is true", () => {
    act(() => {
      root.render(<ToolsList permissions={fullPermissions} />)
    })

    expect(container.textContent).toContain("clickToMessageAds.title")
  })

  test("hides the click-to-message-ads card when superAdmin is false, while an ungated card still renders", () => {
    act(() => {
      root.render(
        <ToolsList permissions={{ ...fullPermissions, superAdmin: false }} />,
      )
    })

    expect(container.textContent).not.toContain("clickToMessageAds.title")
    expect(container.textContent).toContain("facebookLeadAdsAutomation.title")
  })

  test("hides the click-to-message-ads card (fail-closed) when permissions is an empty partial object", () => {
    act(() => {
      root.render(<ToolsList permissions={permissions({})} />)
    })

    expect(container.textContent).not.toContain("clickToMessageAds.title")
    expect(container.textContent).toContain("facebookLeadAdsAutomation.title")
  })

  test("clicking the click-to-message-ads card pushes the tool's workspace path", () => {
    act(() => {
      root.render(<ToolsList permissions={fullPermissions} />)
    })

    const card = container.querySelector<HTMLElement>(
      '[aria-label="clickToMessageAds.title"]',
    )
    if (!card) {
      throw new Error("click-to-message-ads card not rendered")
    }

    act(() => {
      card.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(navigation.push).toHaveBeenCalledWith("/space/ws1/messaging-ads")
  })
})
