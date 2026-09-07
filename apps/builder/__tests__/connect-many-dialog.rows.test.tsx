import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  ROW_STATUS,
  ROW_VISUAL_STATES,
  type RowVisualState,
} from "@/features/channel-connect/lib/row-status"
import type { ConnectActionResultWire } from "@/features/channel-connect/schema"
import {
  buttonByText,
  connected,
  controllableConnectOne,
  flush,
  installDomPolyfills,
  items2,
  itemsOverConcurrency,
  renderConnectManyDialog,
  WHITESPACE_REGEX,
} from "./connect-many-dialog.test-utils"

/**
 * `ConnectManyDialog`'s row-level rendering: per-row badges, notes, Retry
 * actions, and every `ROW_STATUS` visual state. Dialog lifecycle/footer/step
 * behavior lives in `connect-many-dialog.footer-steps.test.tsx`; focus and
 * keyboard-accessibility behavior lives in `connect-many-dialog.a11y.test.tsx`.
 */

/** Echoes the key back (with interpolated values as JSON) so assertions never depend on English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))

installDomPolyfills()

describe("ConnectManyDialog — rows", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
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

  const render = (props: Parameters<typeof renderConnectManyDialog>[1]) =>
    renderConnectManyDialog(root, props)

  test("a connected row with a warning renders the success badge plus the amber warning note", async () => {
    const { connectOne, controllers } = controllableConnectOne()
    render({ items: items2, connectOne })
    await act(async () => {
      await flush()
    })

    await act(async () => {
      controllers.get("a")?.resolve(
        connected({
          sourceId: "a",
          name: "A",
          warning: "followUpFailed",
        }),
      )
      await flush()
      controllers.get("b")?.resolve(connected({ sourceId: "b", name: "B" }))
      await flush()
    })

    expect(document.body.textContent).toContain(
      "channels.connectMany.status.connected",
    )
    expect(document.body.textContent).toContain(
      "channels.connectMany.reason.followUpFailed",
    )
  })

  test("per-row Retry re-runs only that row", async () => {
    const { connectOne, controllers } = controllableConnectOne()
    render({ items: items2, connectOne })
    await act(async () => {
      await flush()
      controllers.get("a")?.resolve({
        kind: "outcome",
        outcome: {
          sourceId: "a",
          name: "A",
          status: "failed",
          reason: "unknown",
          coexistEligible: false,
        },
      })
      await flush()
      controllers.get("b")?.resolve(connected({ sourceId: "b", name: "B" }))
      await flush()
    })

    connectOne.mockClear()
    const rowRetry = buttonByText("channels.connectMany.retry")
    expect(rowRetry).not.toBeUndefined()

    act(() => {
      rowRetry?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    await act(async () => {
      await flush()
    })

    expect(connectOne).toHaveBeenCalledTimes(1)
    expect(connectOne).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a" }),
    )
  })

  test("a provider-rejected row shows the translated reason plus the provider's own sentence", async () => {
    const detail = "WhatsApp accounts cannot be used with this API."
    const { connectOne, controllers } = controllableConnectOne()
    render({ items: items2, connectOne })
    await act(async () => {
      await flush()
      controllers.get("a")?.resolve({
        kind: "outcome",
        outcome: {
          sourceId: "a",
          name: "A",
          status: "failed",
          reason: "providerRejected",
          detail,
          coexistEligible: false,
        },
      })
      await flush()
      controllers.get("b")?.resolve(connected({ sourceId: "b", name: "B" }))
      await flush()
    })

    // The reason stays the headline — the provider's words are added, not
    // swapped in, so the row is still classified the way the batch decided.
    expect(document.body.textContent).toContain(
      "channels.connectMany.status.failed",
    )
    expect(document.body.textContent).toContain(
      "channels.connectMany.reason.providerRejected",
    )
    expect(document.body.textContent).toContain(detail)
    expect(document.querySelector(`[title="${detail}"]`)?.textContent).toBe(
      detail,
    )
  })

  test("row visual states: waiting and connecting render their table-driven label while in flight", async () => {
    const { connectOne } = controllableConnectOne()
    render({ items: itemsOverConcurrency, connectOne })
    await act(async () => {
      await flush()
    })

    // CONNECT_CONCURRENCY rows are connecting; the extra one is still
    // waiting behind them.
    expect(document.body.textContent).toContain(
      "channels.connectMany.status.connecting",
    )
    expect(document.body.textContent).toContain(
      "channels.connectMany.status.waiting",
    )
  })

  test("row visual states: duplicated and limitReached render their badge label, amber classes, and no Retry action", async () => {
    const { connectOne, controllers } = controllableConnectOne()
    render({ items: items2, connectOne })
    await act(async () => {
      await flush()
      controllers.get("a")?.resolve({
        kind: "outcome",
        outcome: {
          sourceId: "a",
          name: "A",
          status: "duplicated",
          reason: "alreadyConnected",
          coexistEligible: false,
        },
      })
      await flush()
      controllers.get("b")?.resolve({
        kind: "outcome",
        outcome: {
          sourceId: "b",
          name: "B",
          status: "limitReached",
          reason: "channelLimit",
          coexistEligible: false,
        },
      })
      await flush()
    })

    expect(document.body.textContent).toContain(
      "channels.connectMany.status.duplicated",
    )
    expect(document.body.textContent).toContain(
      "channels.connectMany.status.limitReached",
    )
    const badges = Array.from(
      document.body.querySelectorAll('[data-slot="badge"]'),
    )
    const duplicatedBadge = badges.find((b) =>
      b.textContent?.includes("channels.connectMany.status.duplicated"),
    )
    const limitBadge = badges.find((b) =>
      b.textContent?.includes("channels.connectMany.status.limitReached"),
    )
    expect(duplicatedBadge?.className).toContain("border-amber-500/40")
    expect(duplicatedBadge?.className).toContain("text-amber-600")
    expect(limitBadge?.className).toContain("border-amber-500/40")
    // Neither status is retryable per ROW_STATUS.
    expect(buttonByText("channels.connectMany.retry")).toBeUndefined()
  })

  test("row visual states: failed renders a destructive badge with a Retry action", async () => {
    const { connectOne, controllers } = controllableConnectOne()
    render({ items: [{ id: "a", name: "A" }], connectOne })
    await act(async () => {
      await flush()
      controllers.get("a")?.resolve({
        kind: "outcome",
        outcome: {
          sourceId: "a",
          name: "A",
          status: "failed",
          reason: "unknown",
          coexistEligible: false,
        },
      })
      await flush()
    })

    const badges = Array.from(
      document.body.querySelectorAll('[data-slot="badge"]'),
    )
    const failedBadge = badges.find((b) =>
      b.textContent?.includes("channels.connectMany.status.failed"),
    )
    expect(failedBadge?.className).toContain("bg-destructive")
    expect(buttonByText("channels.connectMany.retry")).not.toBeUndefined()
  })

  test("row visual states: cancelled renders after Cancel remaining, with a Retry action", async () => {
    const { connectOne, controllers } = controllableConnectOne()
    // One row more than the concurrency, so there is something left to cancel.
    render({ items: itemsOverConcurrency, connectOne })
    await act(async () => {
      await flush()
    })

    act(() => {
      buttonByText("channels.connectMany.cancelRemaining")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      )
    })
    await act(async () => {
      controllers.get("a")?.resolve(connected({ sourceId: "a", name: "A" }))
      await flush()
    })

    expect(document.body.textContent).toContain(
      "channels.connectMany.status.cancelled",
    )
    const badges = Array.from(
      document.body.querySelectorAll('[data-slot="badge"]'),
    )
    const cancelledBadge = badges.find((b) =>
      b.textContent?.includes("channels.connectMany.status.cancelled"),
    )
    expect(cancelledBadge).not.toBeUndefined()
    expect(buttonByText("channels.connectMany.retry")).not.toBeUndefined()
  })

  test("row visual states: timedOut renders after CONNECT_REQUEST_TIMEOUT_MS, with a Retry action", async () => {
    vi.useFakeTimers()
    const connectOne = vi.fn(
      () =>
        new Promise<ConnectActionResultWire>(() => {
          // never resolves
        }),
    )
    render({ items: [{ id: "a", name: "A" }], connectOne })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    expect(document.body.textContent).toContain(
      "channels.connectMany.status.timedOut",
    )
    const badges = Array.from(
      document.body.querySelectorAll('[data-slot="badge"]'),
    )
    const timedOutBadge = badges.find((b) =>
      b.textContent?.includes("channels.connectMany.status.timedOut"),
    )
    expect(timedOutBadge?.className).toContain("bg-destructive")
    expect(buttonByText("channels.connectMany.retry")).not.toBeUndefined()
    vi.useRealTimers()
  })

  describe("every ROW_STATUS visual state, table-driven from ROW_STATUS itself", () => {
    /** Renders `Icon` standalone and returns its SVG's inner markup — used to
     * compare against a row's actual icon by identity rather than by a
     * hardcoded icon name, so the assertion can't drift from ROW_STATUS. */
    function renderIconMarkup(
      Icon: (typeof ROW_STATUS)[RowVisualState]["Icon"],
    ) {
      const scratch = document.createElement("div")
      document.body.append(scratch)
      const scratchRoot = createRoot(scratch)
      act(() => {
        scratchRoot.render(<Icon />)
      })
      const markup = scratch.querySelector("svg")?.innerHTML ?? null
      act(() => {
        scratchRoot.unmount()
      })
      scratch.remove()
      return markup
    }

    /** Background-color signature per Badge variant (see badge.tsx) — none of
     * ROW_STATUS's custom `badgeClassName` strings touch `bg-*`, only
     * border/text colors, so this stays reliable regardless of how
     * tailwind-merge resolves the rest of the class list. */
    function expectBadgeVariant(
      badge: Element | null | undefined,
      variant: string,
    ) {
      const className = badge?.className ?? ""
      if (variant === "destructive") {
        expect(className).toContain("bg-destructive")
        return
      }
      if (variant === "secondary") {
        expect(className).toContain("bg-secondary")
        return
      }
      // "outline" (the only other variant ROW_STATUS uses): no solid
      // background utility at all.
      expect(className).not.toContain("bg-destructive")
      expect(className).not.toContain("bg-secondary")
      expect(className).not.toContain("bg-primary")
    }

    /** Drives the dialog into each state and returns the row `<li>` whose
     * name identifies the row under test, plus the shared connectOne mock
     * (for the "waiting"/"cancelled" scenarios that need to control other
     * rows too). Each scenario is necessarily state-specific — different
     * states are reached through fundamentally different batch mechanics —
     * but the class/icon assertions below are derived purely from
     * `ROW_STATUS`, not hardcoded per state. */
    async function driveToState(state: RowVisualState): Promise<{
      row: Element | null
    }> {
      const { connectOne, controllers } = controllableConnectOne()

      switch (state) {
        case "waiting": {
          render({ items: itemsOverConcurrency, connectOne })
          await act(async () => {
            await flush()
          })
          // The first CONNECT_CONCURRENCY rows are in flight; "D" never
          // started — leave them all pending so "D" stays "waiting".
          return { row: findRowByName("D") }
        }
        case "connecting": {
          render({ items: [{ id: "a", name: "A" }], connectOne })
          await act(async () => {
            await flush()
          })
          return { row: findRowByName("A") }
        }
        case "connected": {
          render({ items: [{ id: "a", name: "A" }], connectOne })
          await act(async () => {
            await flush()
            controllers
              .get("a")
              ?.resolve(connected({ sourceId: "a", name: "A" }))
            await flush()
          })
          return { row: findRowByName("A") }
        }
        case "connectedWarning": {
          render({ items: [{ id: "a", name: "A" }], connectOne })
          await act(async () => {
            await flush()
            controllers.get("a")?.resolve(
              connected({
                sourceId: "a",
                name: "A",
                warning: "followUpFailed",
              }),
            )
            await flush()
          })
          return { row: findRowByName("A") }
        }
        case "duplicated": {
          render({ items: [{ id: "a", name: "A" }], connectOne })
          await act(async () => {
            await flush()
            controllers.get("a")?.resolve({
              kind: "outcome",
              outcome: {
                sourceId: "a",
                name: "A",
                status: "duplicated",
                reason: "alreadyConnected",
                coexistEligible: false,
              },
            })
            await flush()
          })
          return { row: findRowByName("A") }
        }
        case "limitReached": {
          render({ items: [{ id: "a", name: "A" }], connectOne })
          await act(async () => {
            await flush()
            controllers.get("a")?.resolve({
              kind: "outcome",
              outcome: {
                sourceId: "a",
                name: "A",
                status: "limitReached",
                reason: "channelLimit",
                coexistEligible: false,
              },
            })
            await flush()
          })
          return { row: findRowByName("A") }
        }
        case "failed": {
          render({ items: [{ id: "a", name: "A" }], connectOne })
          await act(async () => {
            await flush()
            controllers.get("a")?.resolve({
              kind: "outcome",
              outcome: {
                sourceId: "a",
                name: "A",
                status: "failed",
                reason: "unknown",
                coexistEligible: false,
              },
            })
            await flush()
          })
          return { row: findRowByName("A") }
        }
        case "cancelled": {
          // One row more than the concurrency, so "D" is still queued when
          // Cancel remaining lands on it.
          render({ items: itemsOverConcurrency, connectOne })
          await act(async () => {
            await flush()
          })
          act(() => {
            buttonByText("channels.connectMany.cancelRemaining")?.dispatchEvent(
              new MouseEvent("click", { bubbles: true }),
            )
          })
          await act(async () => {
            for (const id of ["a", "b", "c"]) {
              controllers
                .get(id)
                ?.resolve(connected({ sourceId: id, name: id.toUpperCase() }))
            }
            await flush()
          })
          return { row: findRowByName("D") }
        }
        case "timedOut": {
          vi.useFakeTimers()
          render({ items: [{ id: "a", name: "A" }], connectOne })
          await act(async () => {
            await vi.advanceTimersByTimeAsync(60_000)
          })
          vi.useRealTimers()
          return { row: findRowByName("A") }
        }
        default: {
          const exhaustive: never = state
          throw new Error(`no scenario wired for state: ${exhaustive}`)
        }
      }
    }

    function findRowByName(name: string): Element | null {
      const rows = Array.from(
        document.body.querySelectorAll('[data-slot="dialog-content"] li'),
      )
      return (
        rows.find((li) => {
          const label = li.querySelector("p")
          return label?.textContent === name
        }) ?? null
      )
    }

    test.each(
      ROW_VISUAL_STATES,
    )("state '%s' renders exactly ROW_STATUS's badge variant, badgeClassName, and Icon", async (state) => {
      const config = ROW_STATUS[state]
      const { row } = await driveToState(state)

      expect(row).not.toBeNull()
      const badge = row?.querySelector('[data-slot="badge"]')
      expect(badge).not.toBeNull()
      expect(badge?.textContent).toContain(config.labelKey)

      expectBadgeVariant(badge, config.badgeVariant)
      for (const token of config.badgeClassName
        .split(WHITESPACE_REGEX)
        .filter(Boolean)) {
        expect(badge?.className).toContain(token)
      }

      const iconEl = badge?.querySelector("svg")
      expect(iconEl?.innerHTML).toBe(renderIconMarkup(config.Icon))
      for (const token of config.iconClassName
        .split(WHITESPACE_REGEX)
        .filter(Boolean)) {
        expect(iconEl?.getAttribute("class")).toContain(token)
      }

      const retryButton = row
        ?.querySelector("button")
        ?.textContent?.includes("channels.connectMany.retry")
      expect(Boolean(retryButton)).toBe(config.retryable)
    })
  })

  test("a coexist row whose workspace cannot be resolved shows the failed sub-line instead of silently skipping", async () => {
    const { connectOne, controllers } = controllableConnectOne()
    render({
      items: [{ id: "a", name: "A", coexist: true }],
      connectOne,
      // WhatsApp's resolver before any connect stamped its ref.
      resolveCoexistWorkspaceId: () => undefined,
    })
    await act(async () => {
      await flush()
      controllers.get("a")?.resolve(
        connected({
          sourceId: "a",
          name: "A",
          coexistEligible: true,
          integrationId: "int-1",
        }),
      )
      await flush()
    })

    expect(document.body.textContent).toContain(
      "channels.connectMany.status.connected",
    )
    expect(document.body.textContent).toContain(
      "channels.connectMany.coexist.failed",
    )
    expect(document.body.textContent).toContain("coexist.errors.unknown")
    // The row is still retryable — the connect itself succeeded.
    expect(buttonByText("channels.connectMany.retry")).not.toBeUndefined()
  })
})
