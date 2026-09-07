import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ConnectRowStatus } from "@/features/channel-connect/components/connect-row-status"
import type { RowCoexistState } from "@/features/channel-connect/hooks/use-connect-batch"
import type { RowNote } from "@/features/channel-connect/lib/row-status"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

/**
 * The coexist sub-line under a connect-many row's badge (`COEXIST_ROW_STATUS`)
 * — rendered for rows whose picker switch asked to sync history. The connect
 * badge above it is unaffected: a row whose coexist call failed is still
 * connected.
 */
describe("ConnectRowStatus (coexist sub-line)", () => {
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

  const render = (coexist?: RowCoexistState, onRetry = vi.fn()) => {
    act(() => {
      root.render(
        <ConnectRowStatus
          coexist={coexist}
          onRetry={onRetry}
          retryDisabled={false}
          state="connected"
        />,
      )
    })
    return onRetry
  }

  const retryButton = () =>
    Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("channels.connectMany.retry"),
    )

  test("renders no sub-line when the row asked for no coexist", () => {
    render()

    expect(container.textContent).toContain(
      "channels.connectMany.status.connected",
    )
    expect(container.textContent).not.toContain("channels.connectMany.coexist")
    expect(retryButton()).toBeUndefined()
  })

  test("a running coexist call renders its spinner sub-line and offers no Retry", () => {
    render({ status: "running" })

    expect(container.textContent).toContain(
      "channels.connectMany.coexist.running",
    )
    expect(
      container.querySelector('svg[class*="motion-safe:animate-spin"]'),
    ).not.toBeNull()
    expect(retryButton()).toBeUndefined()
  })

  test("a finished coexist call renders the done sub-line and offers no Retry", () => {
    render({ status: "done" })

    expect(container.textContent).toContain("channels.connectMany.coexist.done")
    expect(retryButton()).toBeUndefined()
  })

  test("a failed coexist call renders the failed sub-line, its text, and a Retry action on a still-connected row", () => {
    const onRetry = render({
      status: "failed",
      text: "The 24-hour sync window has expired.",
    })

    expect(container.textContent).toContain(
      "channels.connectMany.status.connected",
    )
    expect(container.textContent).toContain(
      "channels.connectMany.coexist.failed",
    )
    expect(container.textContent).toContain(
      "The 24-hour sync window has expired.",
    )

    act(() => {
      retryButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  test("a skipped coexist call reports why, offers no Retry, and leaves the row connected", () => {
    render({ status: "skipped" })

    expect(container.textContent).toContain(
      "channels.connectMany.status.connected",
    )
    // The same copy the popup shows for the same reason — no new key.
    expect(container.textContent).toContain("coexist.errors.notEligible")
    expect(retryButton()).toBeUndefined()
  })
})

/**
 * The provider's own sentence on a rejected row: the translated reason stays
 * the headline and the provider's words render beneath it, with the full text
 * on `title` so a clamped sentence is still readable on hover.
 */
describe("ConnectRowStatus (provider detail)", () => {
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

  const renderNote = (note: RowNote) => {
    act(() => {
      root.render(
        <ConnectRowStatus
          note={note}
          onRetry={vi.fn()}
          retryDisabled={false}
          state="failed"
        />,
      )
    })
  }

  const detailSpan = () =>
    Array.from(container.querySelectorAll("span")).find((span) =>
      span.hasAttribute("title"),
    )

  test("renders the provider sentence under the translated reason, with the full text on title", () => {
    const detail = "WhatsApp accounts cannot be used with this API."
    renderNote({
      key: "channels.connectMany.reason.providerRejected",
      tone: "muted",
      detail,
    })

    expect(container.textContent).toContain(
      "channels.connectMany.reason.providerRejected",
    )
    expect(container.textContent).toContain(detail)
    expect(detailSpan()?.getAttribute("title")).toBe(detail)
  })

  test("renders no second line when the failure carried no provider sentence", () => {
    renderNote({
      key: "channels.connectMany.reason.providerRejected",
      tone: "muted",
    })

    expect(container.textContent).toContain(
      "channels.connectMany.reason.providerRejected",
    )
    expect(detailSpan()).toBeUndefined()
  })
})
