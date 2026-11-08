// @vitest-environment jsdom

import { NextIntlClientProvider } from "next-intl"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import messages from "../messages/en.json"

const mocks = vi.hoisted(() => ({ list: vi.fn() }))

vi.mock("@/features/templates/actions/list-template-installers.action", () => ({
  listTemplateInstallersAction: { bind: () => mocks.list },
}))
vi.mock("@/features/templates/actions/get-installer-issues.action", () => ({
  getInstallerIssuesAction: { bind: () => vi.fn() },
}))
vi.mock("@/features/templates/components/installer-uninstall-button", () => ({
  InstallerUninstallButton: ({
    disabled,
    onRequested,
  }: {
    disabled?: boolean
    onRequested?: () => void
  }) => (
    <button
      data-testid="uninstall"
      disabled={disabled}
      onClick={onRequested}
      type="button"
    >
      Uninstall
    </button>
  ),
}))

const { TemplateInstallersDialog } = await import(
  "@/features/templates/components/template-installers-dialog"
)

type Row = {
  publisherRef: string
  workspaceName: string | null
  installCount: number
  totalInstallEvents: number
  lastInstalledAt: Date | null
  oldestVersion: number | null
  autoUpdate: boolean
  active: boolean
  uninstallState: "none"
  installedAutomatically: boolean
  eligibleForUninstall: boolean
  uninstallCounts: null
}

const row = (over: Partial<Row>): Row => ({
  publisherRef: "ref-1",
  workspaceName: "Acme",
  installCount: 1,
  totalInstallEvents: 1,
  lastInstalledAt: new Date("2026-01-01T00:00:00Z"),
  oldestVersion: 2,
  autoUpdate: false,
  active: true,
  uninstallState: "none",
  installedAutomatically: false,
  eligibleForUninstall: true,
  uninstallCounts: null,
  ...over,
})

const page = (items: Row[], nextCursor: string | null = null) => ({
  data: {
    templateVersion: 3,
    byVersion: [{ version: 2, count: items.length }],
    installers: { items, nextCursor },
  },
})

describe("TemplateInstallersDialog", () => {
  let container: HTMLDivElement
  let root: Root

  const render = async () => {
    await act(async () => {
      root.render(
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <TemplateInstallersDialog
            onOpenChange={vi.fn()}
            open
            template={{ id: "tpl-1", name: "Starter" }}
            workspaceId="ws-1"
          />
        </NextIntlClientProvider>,
      )
      await Promise.resolve()
    })
  }
  const text = () => document.body.textContent ?? ""
  const button = (label: string) =>
    Array.from(document.body.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === label,
    )

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

  test("opens titled with the template and lists each installer with its version and an Uninstall", async () => {
    mocks.list.mockResolvedValue(page([row({ oldestVersion: 2 })]))

    await render()

    expect(text()).toContain("Starter")
    expect(text()).toContain("Acme")
    expect(text()).toContain("v2")
    expect(text()).toContain(messages.templates.sync.updateAvailable)
    expect(
      document.body.querySelector("[data-testid='uninstall']"),
    ).not.toBeNull()
    expect(mocks.list).toHaveBeenCalledWith({
      search: undefined,
      cursor: undefined,
    })
  })

  test("offers Details for an installer it can address, not for a blank reference", async () => {
    mocks.list.mockResolvedValue(
      page([
        row({ publisherRef: "a", workspaceName: "One" }),
        row({ publisherRef: "", workspaceName: "Two" }),
      ]),
    )

    await render()

    const details = Array.from(document.body.querySelectorAll("button")).filter(
      (button) => button.textContent === messages.templates.installers.details,
    )
    expect(details).toHaveLength(1)
  })

  test("a workspace that did not allow it is anonymous with Uninstall disabled, and a default's copy is marked Automatic", async () => {
    mocks.list.mockResolvedValue(
      page([
        row({
          workspaceName: null,
          eligibleForUninstall: false,
          installedAutomatically: true,
        }),
      ]),
    )

    await render()

    expect(text()).toContain(messages.templates.installers.hidden)
    expect(text()).toContain(messages.templates.installers.automatic)
    expect(
      document.body.querySelector<HTMLButtonElement>(
        "[data-testid='uninstall']",
      )?.disabled,
    ).toBe(true)
  })

  test("searching asks for that search from the first page", async () => {
    mocks.list.mockResolvedValue(page([row({})]))
    await render()

    const input = document.body.querySelector<HTMLInputElement>(
      "input[type='search']",
    )
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set
      setter?.call(input, " acme ")
      input?.dispatchEvent(new Event("input", { bubbles: true }))
      await Promise.resolve()
    })
    await act(async () => {
      button("Search")?.click()
      await Promise.resolve()
    })

    expect(mocks.list).toHaveBeenLastCalledWith({
      search: "acme",
      cursor: undefined,
    })
  })

  test("Load more appends the next page", async () => {
    mocks.list
      .mockResolvedValueOnce(
        page([row({ publisherRef: "a", workspaceName: "First" })], "cur-1"),
      )
      .mockResolvedValueOnce(
        page([row({ publisherRef: "b", workspaceName: "Second" })]),
      )
    await render()
    expect(text()).toContain("First")

    await act(async () => {
      button(messages.templates.installs.loadMore)?.click()
      await Promise.resolve()
    })

    expect(mocks.list).toHaveBeenLastCalledWith({
      search: undefined,
      cursor: "cur-1",
    })
    expect(text()).toContain("First")
    expect(text()).toContain("Second")
  })

  test("an empty answer and a failure each say so", async () => {
    mocks.list.mockResolvedValue(page([]))
    await render()
    expect(text()).toContain(messages.actions.noRecordFound)

    mocks.list.mockResolvedValue({ serverError: "boom" })
    await act(async () => {
      button("Search")?.click()
      await Promise.resolve()
    })
    expect(text()).toContain(messages.templates.installers.loadError)
  })

  test("an accepted uninstall reloads the list", async () => {
    mocks.list.mockResolvedValue(page([row({})]))
    await render()
    mocks.list.mockClear()

    await act(async () => {
      document.body
        .querySelector<HTMLButtonElement>("[data-testid='uninstall']")
        ?.click()
      await Promise.resolve()
    })

    expect(mocks.list).toHaveBeenCalledTimes(1)
  })

  test("a reload of more installers than one page reads them a page at a time", async () => {
    const many = (from: number, count: number) =>
      Array.from({ length: count }, (_, index) =>
        row({ publisherRef: `ref-${from + index}` }),
      )
    mocks.list
      .mockResolvedValueOnce(page(many(0, 100), "c1"))
      .mockResolvedValueOnce(page(many(100, 25), "c2"))
    await render()
    await act(async () => {
      Array.from(document.body.querySelectorAll("button"))
        .find(
          (button) =>
            button.textContent === messages.templates.installs.loadMore,
        )
        ?.click()
      await Promise.resolve()
    })
    mocks.list.mockReset()
    mocks.list
      .mockResolvedValueOnce(page(many(0, 100), "c1"))
      .mockResolvedValueOnce(page(many(100, 25), "c2"))

    await act(async () => {
      document.body
        .querySelector<HTMLButtonElement>("[data-testid='uninstall']")
        ?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.list.mock.calls.map(([input]) => input.limit)).toEqual([
      100, 25,
    ])
  })

  test("a running uninstall is re-read every few seconds until it ends", async () => {
    vi.useFakeTimers()
    try {
      mocks.list.mockResolvedValue(
        page([row({ uninstallState: "running" as never })]),
      )
      await render()
      mocks.list.mockClear()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3100)
      })
      expect(mocks.list).toHaveBeenCalledTimes(1)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3100)
      })
      expect(mocks.list).toHaveBeenCalledTimes(2)

      mocks.list.mockResolvedValue(page([row({})]))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3100)
      })
      expect(mocks.list).toHaveBeenCalledTimes(3)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000)
      })
      expect(mocks.list).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })
})
