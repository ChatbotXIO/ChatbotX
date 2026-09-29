import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import WorkspacesList from "@/features/workspaces/components/workspaces-list"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))

const { mockIsCommunity } = vi.hoisted(() => ({
  mockIsCommunity: vi.fn(() => true),
}))

vi.mock("@/env", () => ({
  isCloud: () => false,
  isCommunity: mockIsCommunity,
}))

// The component only reads isWorkspaceScheduledForDeletion (both the bare
// package and the workspace-lifecycle subpath, used by the nested
// WorkspaceStatusSwitch); the full package pulls in the database client,
// which throws outside a real server runtime.
vi.mock("@chatbotx.io/business", () => ({
  isWorkspaceScheduledForDeletion: () => false,
}))
vi.mock("@chatbotx.io/business/workspace-lifecycle/predicates", () => ({
  isWorkspaceScheduledForDeletion: () => false,
}))

// Unconditionally imported by WorkspacesList (only rendered when
// isAtLimit && isCloud(), neither true here); its action pulls in the
// enterprise billing/audit chain, which needs a real server runtime.
vi.mock("@/enterprise/features/billing/upgrade-plan-dialog", () => ({
  UpgradePlanButton: () => null,
}))

// WorkspaceStatusSwitch's own action chain (auth/business/db) needs a real
// server runtime; not what this test is about (create-card visibility).
vi.mock("@/features/workspaces/components/workspace-status-switch", () => ({
  WorkspaceStatusSwitch: () => null,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

async function renderWorkspacesList(
  workspaces: Parameters<typeof WorkspacesList>[0]["workspaces"],
) {
  const ui = await WorkspacesList({
    user: { name: "Test User", email: "test@example.com", image: null },
    workspaces,
  })
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(ui)
  })
  return container
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
  mockIsCommunity.mockReturnValue(true)
})

describe("WorkspacesList — community edition, zero workspaces", () => {
  test("shows the create-workspace card, not just a static message", async () => {
    const el = await renderWorkspacesList([])

    // The create card links to /channels/create — the only entry point into
    // createFirstWorkspace for a user with none yet.
    const createLink = el.querySelector('a[href="/channels/create"]')
    expect(createLink).not.toBeNull()
  })

  test("still hides the card once the workspace already exists", async () => {
    const el = await renderWorkspacesList([
      {
        id: "1",
        name: "My workspace",
        logo: null,
        status: "active",
        endTime: null,
        scheduledDeletionAt: null,
        // Minimal fixture: only the fields WorkspacesList actually reads matter here.
      } as unknown as Parameters<
        typeof WorkspacesList
      >[0]["workspaces"][number],
    ])

    const createLink = el.querySelector('a[href="/channels/create"]')
    expect(createLink).toBeNull()
  })
})
