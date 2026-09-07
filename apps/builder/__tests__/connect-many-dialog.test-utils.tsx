import { DialogTitle } from "@chatbotx.io/ui/components/ui/dialog"
import { act, type RefObject } from "react"
import type { Root } from "react-dom/client"
import { vi } from "vitest"
import {
  type ConnectDialogExtraStep,
  ConnectManyDialog,
} from "@/features/channel-connect/components/connect-many-dialog"
import type { ConnectPickerItem } from "@/features/channel-connect/lib/picker-items"
import type {
  ConnectActionResultWire,
  ConnectOutcome,
} from "@/features/channel-connect/schema"

/**
 * Shared render/fixture helpers for the `ConnectManyDialog` suite, split
 * across `connect-many-dialog.rows.test.tsx`,
 * `connect-many-dialog.footer-steps.test.tsx`, and
 * `connect-many-dialog.a11y.test.tsx`. Each of those files still registers
 * its own `vi.mock("next-intl", ...)` (mocking is file-scoped in Vitest) and
 * its own `beforeEach`/`afterEach` container+root lifecycle — only the
 * render/assert plumbing lives here.
 */

/** jsdom ships neither — Base UI's Switch/Progress measure through them. Call once per test file's module scope. */
export function installDomPolyfills() {
  Object.assign(globalThis, {
    ResizeObserver: class {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    },
  })
  if (typeof globalThis.PointerEvent === "undefined") {
    class PointerEventPolyfill extends MouseEvent {
      constructor(type: string, params: MouseEventInit = {}) {
        super(type, params)
      }
    }
    Object.assign(globalThis, { PointerEvent: PointerEventPolyfill })
  }
}

export type Deferred = {
  promise: Promise<ConnectActionResultWire>
  resolve: (result: ConnectActionResultWire) => void
}

export function deferred(): Deferred {
  let resolve!: (result: ConnectActionResultWire) => void
  const promise = new Promise<ConnectActionResultWire>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

export function controllableConnectOne() {
  const controllers = new Map<string, Deferred>()
  const connectOne = vi.fn((item: ConnectPickerItem) => {
    const d = deferred()
    controllers.set(item.id, d)
    return d.promise
  })
  return { connectOne, controllers }
}

export function connected(
  overrides: Partial<ConnectOutcome> = {},
): ConnectActionResultWire {
  return {
    kind: "outcome",
    outcome: {
      sourceId: "a",
      name: "A",
      status: "connected",
      coexistEligible: false,
      ...overrides,
    },
  }
}

/**
 * Drains the microtask queue.
 *
 * The depth is deliberately generous rather than calibrated against the
 * production hook's exact number of `await` hops: a helper that only works
 * while `useConnectBatch` keeps its whole worker in one function body is a test
 * constraint on production design, which is what kept that hook a 239-line
 * monolith. Pending promises the test has not resolved yet are
 * unaffected by extra microtask turns, so intermediate states stay observable.
 */
export async function flush(n = 20) {
  for (let i = 0; i < n; i++) {
    await Promise.resolve()
  }
}

export const WHITESPACE_REGEX = /\s+/

/**
 * Polls `check` with a real macrotask between attempts. Base UI's own
 * `initialFocus` handling (unlike our own step-change focus effect) does not
 * reliably settle within a fixed microtask/macrotask flush under a loaded
 * full-suite run — a bounded poll is more robust than a fixed wait without
 * weakening what the assertion actually verifies.
 */
export async function waitForCondition(
  check: () => boolean,
  { timeoutMs = 2000, stepMs = 10 } = {},
) {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor: condition was not met within the timeout")
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, stepMs))
    })
  }
}

export const items2: ConnectPickerItem[] = [
  { id: "a", name: "A" },
  { id: "b", name: "B" },
]

/**
 * One more row than `CONNECT_CONCURRENCY`, so the batch always leaves exactly
 * one row queued behind the ones in flight — what the "waiting" and
 * "Cancel remaining" states need now that the transport runs in parallel.
 */
export const itemsOverConcurrency: ConnectPickerItem[] = [
  { id: "a", name: "A" },
  { id: "b", name: "B" },
  { id: "c", name: "C" },
  { id: "d", name: "D" },
]

/**
 * A stand-in for a channel-supplied step (WhatsApp verification /
 * manualResult), so the dialog's multi-step behaviour — stepper, Continue
 * label, focus on step change — is exercised without depending on any one
 * channel's step. The dialog itself has exactly one built-in step
 * ("connecting") since coexist moved into the picker.
 */
export const EXTRA_STEP_TITLE = "extra.step.title"

export function fakeExtraStep(): ConnectDialogExtraStep {
  return {
    id: "extra",
    labelKey: "extra.step.label",
    isApplicable: () => true,
    render: ({ titleRef, onNext }) => (
      <>
        <DialogTitle ref={titleRef} tabIndex={-1}>
          {EXTRA_STEP_TITLE}
        </DialogTitle>
        <button onClick={onNext} type="button">
          extra.step.done
        </button>
      </>
    ),
  }
}

export type RenderConnectManyDialogProps = {
  channel?: "messenger" | "instagram" | "whatsapp"
  items: ConnectPickerItem[]
  connectOne: (item: ConnectPickerItem) => Promise<ConnectActionResultWire>
  onFinished?: () => void
  onClose?: () => void
  finalFocusRef?: RefObject<HTMLElement | null>
  extraSteps?: ConnectDialogExtraStep[]
  resolveCoexistWorkspaceId?: () => string | undefined
}

export function renderConnectManyDialog(
  root: Root,
  props: RenderConnectManyDialogProps,
) {
  act(() => {
    root.render(
      <ConnectManyDialog
        channel={props.channel ?? "messenger"}
        connectOne={props.connectOne}
        extraSteps={props.extraSteps}
        finalFocusRef={props.finalFocusRef}
        items={props.items}
        onClose={props.onClose ?? vi.fn()}
        onFinished={props.onFinished ?? vi.fn()}
        resolveCoexistWorkspaceId={props.resolveCoexistWorkspaceId}
        workspaceId="ws-1"
      />,
    )
  })
}

export function buttonByText(text: string) {
  return Array.from(document.body.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(text),
  )
}

export function closeButtons() {
  return Array.from(document.body.querySelectorAll("button")).filter(
    (button) => button.getAttribute("aria-label") === "Close",
  )
}
