// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { toDateFnsLocale } from "@/lib/date-fns-locale"

const picker = vi.hoisted(() => ({ props: undefined as unknown }))

vi.mock("next-intl", () => ({
  useLocale: () => "vi",
  useTranslations: () => (key: string) => key,
}))

// Capture what the shared picker receives instead of opening its popover.
vi.mock("@chatbotx.io/ui/components/ui/date-picker", () => ({
  DateTimePicker: (props: unknown) => {
    picker.props = props
    return null
  },
}))

const { DateInput } = await import("../date-input")

type PickerProps = {
  onChange: (date: Date | undefined) => void
  locale: unknown
}

describe("DateInput", () => {
  let container: HTMLDivElement
  let root: Root
  const onChange = vi.fn()

  const render = (value: Date | undefined) =>
    act(() => {
      root.render(
        <DateInput
          granularity="day"
          label="From"
          onChange={onChange}
          value={value}
        />,
      )
    })

  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    onChange.mockClear()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("the calendar uses the app locale", () => {
    render(undefined)

    expect((picker.props as PickerProps).locale).toBe(toDateFnsLocale("vi"))
  })

  test("a set value can be cleared; an empty one shows no clear button", () => {
    render(undefined)
    expect(container.querySelector("button")).toBeNull()

    render(new Date("2026-05-20T00:00:00"))
    act(() => container.querySelector("button")?.click())

    expect(onChange).toHaveBeenCalledWith(undefined)
  })
})

describe("toDateFnsLocale", () => {
  test("maps app locales and falls back to English", () => {
    expect(toDateFnsLocale("vi").code).toBe("vi")
    expect(toDateFnsLocale("pt-BR").code).toBe("pt-BR")
    expect(toDateFnsLocale("xx").code).toBe("en-US")
  })
})
