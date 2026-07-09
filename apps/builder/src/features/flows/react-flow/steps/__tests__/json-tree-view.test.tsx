// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { JsonTreeView } from "../external-request/components/json-tree-view"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
})

const render = (ui: React.ReactElement) => {
  act(() => {
    root.render(ui)
  })
}

const clickButtonWithText = (text: string) => {
  const button = Array.from(container.querySelectorAll("button")).find(
    (el) => el.textContent === text,
  )
  if (!button) {
    throw new Error(`No button found with text "${text}"`)
  }
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  })
}

const clickExpandToggleFor = (labelText: string) => {
  const labelButton = Array.from(container.querySelectorAll("button")).find(
    (el) => el.textContent === labelText,
  )
  if (!labelButton?.parentElement) {
    throw new Error(`No expandable node found with label "${labelText}"`)
  }
  const toggle = labelButton.parentElement.querySelector("button[aria-label]")
  if (!toggle) {
    throw new Error(`No expand toggle found for "${labelText}"`)
  }
  act(() => {
    toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  })
}

describe("JsonTreeView", () => {
  test("emits a dot-prop path for a top-level leaf", () => {
    const onSelectPath = vi.fn()
    render(<JsonTreeView data={{ id: 123 }} onSelectPath={onSelectPath} />)

    clickButtonWithText("id")
    expect(onSelectPath).toHaveBeenCalledWith("id")
  })

  test("emits a dot-prop path for a nested array item", () => {
    const onSelectPath = vi.fn()
    render(
      <JsonTreeView
        data={{ items: [{ name: "first" }, { name: "second" }] }}
        onSelectPath={onSelectPath}
      />,
    )

    clickExpandToggleFor("items")
    clickExpandToggleFor("0")
    clickButtonWithText("name")
    expect(onSelectPath).toHaveBeenCalledWith("items.0.name")
  })

  test("renders values as plain text, not injected HTML", () => {
    const malicious = '<img src=x onerror="window.__pwned = true">'
    render(
      <JsonTreeView data={{ comment: malicious }} onSelectPath={vi.fn()} />,
    )

    expect(container.querySelector("img")).toBeNull()
    expect(container.textContent).toContain(malicious)
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined()
  })
})
