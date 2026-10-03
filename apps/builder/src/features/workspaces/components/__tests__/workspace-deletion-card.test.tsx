// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const translations: Record<string, string> = {
  "workspace.deletion.title": "Delete workspace",
  "workspace.deletion.description": "Permanently delete this workspace.",
  "workspace.deletion.schedule": "Delete workspace",
  "workspace.deletion.confirmTitle": "Delete this workspace?",
  "workspace.deletion.confirmDescription": "This cannot be undone.",
  "workspace.deletion.pending": "Workspace deletion is pending.",
  "workspace.deletion.pendingFallback": "soon",
  "workspace.deletion.purging": "Workspace deletion is in progress.",
  "actions.undo": "Undo",
  "actions.cancel": "Cancel",
  "actions.delete": "Delete",
}

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => translations[key] ?? key,
  useLocale: () => "en",
}))

const capturedOptions: Record<
  string,
  {
    onError?: (result: { error: { serverError?: string } }) => void
    onSuccess?: () => void
  }
> = {}

vi.mock("next-safe-action/hooks", () => ({
  useAction: (
    action: { __name: string },
    options: {
      onError?: (result: { error: { serverError?: string } }) => void
      onSuccess?: () => void
    },
  ) => {
    capturedOptions[action.__name] = options
    return { execute: vi.fn(), isPending: false }
  },
}))

vi.mock("../../actions/schedule-workspace-deletion-action", () => ({
  scheduleWorkspaceDeletionAction: {
    __name: "schedule",
    bind: () => ({ __name: "schedule" }),
  },
}))

vi.mock("../../actions/cancel-workspace-deletion-action", () => ({
  cancelWorkspaceDeletionAction: {
    __name: "cancel",
    bind: () => ({ __name: "cancel" }),
  },
}))

const WORKSPACE_ID = "ws_123"

describe("WorkspaceDeletionCard", () => {
  let container: HTMLDivElement
  let root: Root
  let reloadMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)

    reloadMock = vi.fn()
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload: reloadMock },
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  async function render(
    scheduledDeletionAt: string | null = null,
    purgeStartedAt: string | null = null,
  ) {
    const { WorkspaceDeletionCard } = await import("../workspace-deletion-card")
    act(() => {
      root.render(
        <WorkspaceDeletionCard
          workspace={{ id: WORKSPACE_ID, purgeStartedAt, scheduledDeletionAt }}
        />,
      )
    })
  }

  it("does a full page reload after scheduling deletion succeeds", async () => {
    await render(null)

    capturedOptions.schedule?.onSuccess?.()

    expect(reloadMock).toHaveBeenCalledTimes(1)
  })

  it("does a full page reload after canceling deletion succeeds", async () => {
    await render(new Date().toISOString())

    capturedOptions.cancel?.onSuccess?.()

    expect(reloadMock).toHaveBeenCalledTimes(1)
  })

  it("shows Undo while deletion is pending", async () => {
    await render(new Date().toISOString())

    expect(container.textContent).toContain("Undo")
  })

  it("shows purging without Undo", async () => {
    await render(new Date().toISOString(), new Date().toISOString())

    expect(container.textContent).toContain(
      "Workspace deletion is in progress.",
    )
    expect(container.textContent).not.toContain("Undo")
  })

  it("reloads after a stale cancellation is rejected", async () => {
    await render(new Date().toISOString())

    capturedOptions.cancel?.onError?.({
      error: { serverError: "Workspace deletion has already started." },
    })

    expect(reloadMock).toHaveBeenCalledTimes(1)
  })
})
