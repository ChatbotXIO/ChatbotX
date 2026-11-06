// @vitest-environment jsdom

import { NextIntlClientProvider } from "next-intl"
import { act, type ComponentProps } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { SyncHistoryList } from "@/features/templates/components/sync-history-list"
import messages from "../messages/en.json"

vi.mock("@/features/templates/actions/restore-sync-backup.action", () => ({
  restoreSyncBackupAction: { bind: () => vi.fn() },
}))
vi.mock("@/features/templates/lib/use-invalidate-template-kinds", () => ({
  useInvalidateAfterTemplateChange: () => vi.fn(),
}))
vi.mock("@/features/templates/lib/use-refreshing-action", () => ({
  useRefreshingAction: () => ({ execute: vi.fn(), isPending: false }),
}))

type History = ComponentProps<typeof SyncHistoryList>["history"]

describe("sync history counts", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("tells only what happened", () => {
    const history = [
      {
        id: "1",
        status: "partial",
        createdAt: new Date("2026-11-06T00:00:00Z"),
        counts: { created: 0, updated: 56, detached: 1, notUpdatable: 15 },
        errorCode: null,
        trigger: "automatic",
        changes: [],
        backups: [],
      },
    ] as unknown as History

    act(() =>
      root.render(
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <SyncHistoryList
            history={history}
            installationId="2"
            workspaceId="1"
          />
        </NextIntlClientProvider>,
      ),
    )

    expect(container.textContent).toContain(
      "56 updated · 1 no longer follow the template · 15 not updatable yet",
    )
    expect(container.textContent).not.toContain("0 added")
  })
})
