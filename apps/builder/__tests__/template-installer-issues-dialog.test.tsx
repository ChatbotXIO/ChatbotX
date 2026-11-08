// @vitest-environment jsdom

import { NextIntlClientProvider } from "next-intl"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { InstallerIssuesDialog } from "@/features/templates/components/installer-issues-dialog"
import messages from "../messages/en.json"

const { getIssues } = vi.hoisted(() => ({ getIssues: vi.fn() }))

vi.mock("@/features/templates/actions/get-installer-issues.action", () => ({
  getInstallerIssuesAction: { bind: () => getIssues },
}))

describe("installer issues dialog", () => {
  let container: HTMLDivElement
  let root: Root

  const render = async () => {
    await act(async () => {
      root.render(
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <InstallerIssuesDialog
            installer={{ publisherRef: "ref", name: "Acme" }}
            onOpenChange={vi.fn()}
            templateId="1"
            workspaceId="2"
          />
        </NextIntlClientProvider>,
      )
      await Promise.resolve()
    })
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    getIssues.mockReset()
  })

  test("lists the warnings of the copy by resource", async () => {
    getIssues.mockResolvedValue({
      data: {
        status: "partial",
        errorCode: null,
        warningGroups: [
          {
            category: "flows",
            sourceId: "1",
            name: "Sales flow",
            skipped: false,
            issues: [{ code: "pipeline", count: 2 }],
          },
        ],
      },
    })

    await render()

    expect(document.body.textContent).toContain("Sales flow")
    expect(document.body.textContent).toContain(
      "Uses a pipeline that no longer exists. (2)",
    )
  })

  test("says so when nothing went wrong", async () => {
    getIssues.mockResolvedValue({
      data: { status: "completed", errorCode: null, warningGroups: [] },
    })

    await render()

    expect(document.body.textContent).toContain("No warnings or errors.")
  })

  test("shows the load error when the read fails", async () => {
    getIssues.mockRejectedValue(new Error("boom"))

    await render()

    expect(document.body.textContent).toContain("Could not load the installers")
  })
})
