// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  FacebookPages,
  type PickerFacebookPage,
} from "@/features/integration-messenger/components/messenger-pages"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

// FacebookPages only reads the submission machinery to wire up the form;
// none of these tests submit, so a minimal stub keeps the adapter's
// `useFormIntegration` (which reads `action.result`/`action.executeAsync`)
// satisfied without pulling in the real safe-action runtime.
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({
    result: {},
    reset: vi.fn(),
    executeAsync: vi.fn(async () => ({})),
    execute: vi.fn(),
    isPending: false,
  }),
}))

// The real action module is a "use server" file that imports the database
// client and business services — unnecessary (and unsafe) to load for a
// component test that never submits the form.
vi.mock(
  "../src/features/integration-messenger/actions/select-page.action",
  () => ({
    selectPageAction: vi.fn(),
  }),
)

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

// jsdom ships no ResizeObserver/PointerEvent constructors; Base UI's radio
// group measures/dispatches through them even when nothing is clicked.
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

const selectablePage: PickerFacebookPage = {
  id: "page-selectable",
  name: "Selectable Page",
  access_token: "selectable-token",
  isConnectable: true,
  isAlreadyConnected: false,
}

const notAdminPage: PickerFacebookPage = {
  id: "page-not-admin",
  name: "Not Admin Page",
  isConnectable: false,
  isAlreadyConnected: false,
}

const connectedPage: PickerFacebookPage = {
  id: "page-connected",
  name: "Connected Page",
  isConnectable: false,
  isAlreadyConnected: true,
}

// Connect-eligible but already connected elsewhere: still disabled with the
// already-connected note, and must not trigger the not-admin warning.
const connectableButConnectedPage: PickerFacebookPage = {
  id: "page-connectable-but-connected",
  name: "Connectable But Connected Page",
  isConnectable: true,
  isAlreadyConnected: true,
}

describe("FacebookPages", () => {
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

  function renderPages(pages: PickerFacebookPage[]) {
    act(() => {
      root.render(
        <FacebookPages
          onCoexistRequired={vi.fn()}
          pages={pages}
          workspaceId="ws-1"
        />,
      )
    })
  }

  test("renders a disabled radio input with the notAdminNote description for a non-admin page", () => {
    renderPages([selectablePage, notAdminPage])

    const radios = container.querySelectorAll<HTMLInputElement>(
      'input[type="radio"]',
    )
    expect(radios).toHaveLength(2)
    expect(radios[0]?.disabled).toBe(false)
    expect(radios[1]?.disabled).toBe(true)

    expect(container.textContent).toContain("messenger.selectPage.notAdminNote")
  })

  test("shows the no-connectable-pages warning when no page is selectable", () => {
    renderPages([notAdminPage, connectedPage])

    expect(container.textContent).toContain(
      "messenger.selectPage.noConnectablePagesTitle",
    )
    expect(container.textContent).toContain(
      "messenger.selectPage.noConnectablePagesDescription",
    )

    const tryAgainLink = Array.from(container.querySelectorAll("a")).find(
      (link) => link.getAttribute("href") === "/channels/create",
    )
    expect(tryAgainLink).not.toBeUndefined()

    const radios = container.querySelectorAll<HTMLInputElement>(
      'input[type="radio"]',
    )
    expect(radios).toHaveLength(2)
    for (const radio of Array.from(radios)) {
      expect(radio.disabled).toBe(true)
    }
  })

  test("does not show the not-admin warning when every page is merely already connected", () => {
    renderPages([connectedPage, connectableButConnectedPage])

    expect(container.textContent).not.toContain(
      "messenger.selectPage.noConnectablePagesTitle",
    )
    // The rows' own notes already explain why nothing is selectable.
    expect(container.textContent).toContain(
      "messenger.selectPage.alreadyConnectedNote",
    )

    const radios = container.querySelectorAll<HTMLInputElement>(
      'input[type="radio"]',
    )
    expect(radios).toHaveLength(2)
    for (const radio of Array.from(radios)) {
      expect(radio.disabled).toBe(true)
    }
  })

  test("does not show the no-connectable-pages warning when at least one page is selectable", () => {
    renderPages([selectablePage, notAdminPage])

    expect(container.textContent).not.toContain(
      "messenger.selectPage.noConnectablePagesTitle",
    )
  })
})
