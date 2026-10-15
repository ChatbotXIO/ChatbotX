// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const { SecretUrlInput } = await import(
  "../src/features/inbound-webhooks/components/secret-url-input"
)

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() =>
    root.render(<SecretUrlInput value="https://x.test/api/hooks/iwh_secret" />),
  )
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const input = () => container.querySelector("input") as HTMLInputElement
const toggle = () => container.querySelector("button") as HTMLButtonElement

describe("SecretUrlInput", () => {
  test("shows the host and path but masks the secret by default", () => {
    expect(input().value).toBe(`https://x.test/api/hooks/${"•".repeat(24)}`)
    expect(input().value).not.toContain("iwh_secret")
    expect(input().readOnly).toBe(true)
    expect(toggle().getAttribute("aria-label")).toBe("show")
  })

  test("is never a password input, so password managers do not offer to store the token", () => {
    expect(input().type).toBe("text")
    act(() => toggle().click())
    expect(input().type).toBe("text")
    expect(input().autocomplete).toBe("off")
    expect(input().hasAttribute("data-1p-ignore")).toBe(true)
    expect(input().getAttribute("data-lpignore")).toBe("true")
    expect(input().hasAttribute("data-bwignore")).toBe(true)
  })

  test("the eye button reveals the full URL and hides it again", () => {
    act(() => toggle().click())
    expect(input().value).toBe("https://x.test/api/hooks/iwh_secret")
    expect(toggle().getAttribute("aria-label")).toBe("hide")

    act(() => toggle().click())
    expect(input().value).toBe(`https://x.test/api/hooks/${"•".repeat(24)}`)
    expect(toggle().getAttribute("aria-label")).toBe("show")
  })

  test("an empty URL (not known yet) stays empty instead of showing a mask", () => {
    act(() => root.render(<SecretUrlInput value="" />))

    expect(input().value).toBe("")
  })

  test("is not a form submit button", () => {
    expect(toggle().type).toBe("button")
  })
})
