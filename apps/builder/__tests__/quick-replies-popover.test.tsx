import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { SavedReplyStoreProvider } from "@/features/saved-replies/provider/saved-reply-store-context"
import { QuickRepliesPopover } from "@/features/saved-replies/quick-replies-popover"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

function renderComponent(ui: React.ReactElement) {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(ui)
  })
  return container
}

function renderPopover(inputValue: string) {
  const el = renderComponent(
    <SavedReplyStoreProvider autoInitialize={false} workspaceId="ws-1">
      <QuickRepliesPopover inputValue={inputValue} onSelect={() => undefined}>
        <textarea defaultValue={inputValue} />
      </QuickRepliesPopover>
    </SavedReplyStoreProvider>,
  )

  const textarea = el.querySelector("textarea")
  expect(textarea).not.toBeNull()
  return textarea as HTMLTextAreaElement
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
})

describe("QuickRepliesPopover", () => {
  // Regression: the textarea used to be the Popover.Trigger with
  // `nativeButton={false}`, so Base UI's non-native button keyboard handling
  // called preventDefault() on every Space keypress and no space could be typed
  // into the inbox composer.
  test("does not swallow the Space key typed into the wrapped input", () => {
    const textarea = renderPopover("hello")

    const spaceKeyDown = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: " ",
    })

    act(() => {
      textarea.dispatchEvent(spaceKeyDown)
    })

    expect(spaceKeyDown.defaultPrevented).toBe(false)
  })

  test("leaves the wrapped input's own semantics intact", () => {
    const textarea = renderPopover("hello")

    expect(textarea.getAttribute("role")).toBeNull()
  })
})
