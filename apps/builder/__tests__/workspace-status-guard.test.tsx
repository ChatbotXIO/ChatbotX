// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockUseRouter, mockUseTranslations } = vi.hoisted(() => ({
  mockUseRouter: vi.fn(),
  mockUseTranslations: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: mockUseRouter,
}))

vi.mock("next-intl", () => ({
  useTranslations: mockUseTranslations,
}))

vi.mock("@/features/workspaces/components/workspace-schedule-dialog", () => ({
  WorkspaceScheduleDialog: () => null,
}))

vi.mock(
  "../src/features/workspaces/actions/update-workspace-status-action",
  () => ({
    updateWorkspaceStatusAction: vi.fn(),
  }),
)

const { WorkspaceStatusSwitch } = await import(
  "../src/features/workspaces/components/workspace-status-switch"
)

describe("workspace status guard", () => {
  beforeEach(() => {
    mockUseRouter.mockReturnValue({ refresh: vi.fn() })
    mockUseTranslations.mockReturnValue((key: string) => key)
  })

  test("disables the switch for members without super admin access", () => {
    const html = renderToStaticMarkup(
      <WorkspaceStatusSwitch
        canManageStatus={false}
        workspace={{
          id: "ws-1",
          isActive: false,
          startTime: null,
          endTime: null,
        }}
      />,
    )

    const container = document.createElement("div")
    container.innerHTML = html

    const switchElement = container.querySelector('[role="switch"]')

    expect(switchElement).not.toBeNull()
    expect(switchElement?.hasAttribute("disabled")).toBe(true)
  })

  test("keeps the switch enabled for super admins", () => {
    const html = renderToStaticMarkup(
      <WorkspaceStatusSwitch
        canManageStatus
        workspace={{
          id: "ws-1",
          isActive: false,
          startTime: null,
          endTime: null,
        }}
      />,
    )

    const container = document.createElement("div")
    container.innerHTML = html

    const switchElement = container.querySelector('[role="switch"]')

    expect(switchElement).not.toBeNull()
    expect(switchElement?.hasAttribute("disabled")).toBe(false)
  })
})
