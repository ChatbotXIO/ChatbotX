import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, test, vi } from "vitest"
import { useCurrencyOptions } from "@/hooks/use-currency-options"

vi.mock("next-intl", () => ({ useLocale: () => "en" }))

type Options = ReturnType<typeof useCurrencyOptions>

/** Mounts the hook once and returns what it produced. */
function optionsFor(current: string): Options {
  let result: Options = []
  function Probe() {
    result = useCurrencyOptions(current)
    return null
  }
  const container = document.createElement("div")
  const root = createRoot(container)
  act(() => {
    root.render(<Probe />)
  })
  act(() => {
    root.unmount()
  })
  return result
}

describe("useCurrencyOptions", () => {
  test("an empty current value (follow the workspace) does not throw and adds no option", () => {
    const options = optionsFor("")

    expect(options.length).toBeGreaterThan(100)
    expect(options.some((option) => option.value === "")).toBe(false)
  })

  test("labels the codes by their localized name and code", () => {
    expect(optionsFor("").find((option) => option.value === "VND")?.label).toBe(
      "Vietnamese Dong (VND)",
    )
  })

  test("keeps the current code even when the runtime does not list it", () => {
    expect(optionsFor("ZZZ").some((option) => option.value === "ZZZ")).toBe(
      true,
    )
  })
})
