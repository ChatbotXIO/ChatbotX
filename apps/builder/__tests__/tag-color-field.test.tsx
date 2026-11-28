// @vitest-environment jsdom

import { TAG_PRESET_COLORS } from "@chatbotx.io/utils/color"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { color?: string }) =>
    values?.color ? `${key}:${values.color}` : key,
}))

const { TagColorField } = await import("@/features/tags/tag-color-field")

type Values = { name?: string; color?: string | null }

let latest: Values = {}

function Harness({
  defaultColor,
  defaultName = "",
}: {
  defaultColor: string | null
  defaultName?: string
}) {
  const form = useForm<Values>({
    defaultValues: { name: defaultName, color: defaultColor },
  })
  latest = form.watch()
  return (
    <FormProvider {...form}>
      <TagColorField />
    </FormProvider>
  )
}

describe("TagColorField presets", () => {
  let container: HTMLDivElement
  let root: Root

  const render = async (defaultColor: string | null, defaultName = "") => {
    await act(() => {
      root.render(
        <Harness defaultColor={defaultColor} defaultName={defaultName} />,
      )
    })
  }
  const custom = () =>
    container.querySelector<HTMLButtonElement>('button[aria-label="choose"]')
  const preview = () =>
    container.querySelector<HTMLElement>('[data-testid="tag-color-preview"]')
  const swatch = (color: string) =>
    container.querySelector<HTMLButtonElement>(
      `button[aria-label="presetLabel:${color}"]`,
    )

  beforeEach(() => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  test("shows the nine presets and preselects none when the tag has no color", async () => {
    await render(null)

    for (const color of TAG_PRESET_COLORS) {
      expect(swatch(color)?.getAttribute("aria-pressed")).toBe("false")
    }
    expect(container.querySelectorAll("button[aria-pressed]")).toHaveLength(10)
    expect(custom()?.getAttribute("aria-pressed")).toBe("false")
    expect(container.querySelector('button[aria-pressed="true"]')).toBeNull()
    expect(latest.color).toBeNull()
  })

  test("clicking a swatch sets that color, marks it selected with a check", async () => {
    await render(null)

    await act(async () => swatch("#FF7A45")?.click())

    expect(latest.color).toBe("#FF7A45")
    expect(swatch("#FF7A45")?.getAttribute("aria-pressed")).toBe("true")
    expect(swatch("#FF7A45")?.querySelector("svg")).not.toBeNull()
    expect(swatch("#1890FF")?.getAttribute("aria-pressed")).toBe("false")
  })

  test("an existing color matching a preset (any case) shows as selected", async () => {
    await render("#1cae67")

    expect(swatch("#1CAE67")?.getAttribute("aria-pressed")).toBe("true")
  })

  test("a custom color selects no swatch and the custom square shows the check", async () => {
    await render("#123456")

    expect(custom()?.getAttribute("aria-pressed")).toBe("true")
    expect(custom()?.querySelector("svg")).not.toBeNull()
    for (const color of TAG_PRESET_COLORS) {
      expect(swatch(color)?.getAttribute("aria-pressed")).toBe("false")
    }
  })

  test("swatches are square rounded buttons and the custom one comes first", async () => {
    await render(null)

    const buttons = Array.from(container.querySelectorAll("button"))
    expect(buttons[0]).toBe(custom())
    expect(buttons[0]?.className).toContain("size-8")
    expect(buttons[0]?.className).toContain("rounded-lg")
    expect(buttons[0]?.className).not.toContain("rounded-full")
    expect(custom()?.querySelector("svg")).not.toBeNull()
    expect(buttons[1]).toBe(swatch(TAG_PRESET_COLORS[0]))
  })

  test("a preset shows its check on the preset, not on the custom square", async () => {
    await render("#1890FF")

    expect(swatch("#1890FF")?.querySelector("svg")).not.toBeNull()
    expect(custom()?.getAttribute("aria-pressed")).toBe("false")
  })

  test("the custom square opens the picker with a hex input", async () => {
    await render(null)

    await act(async () => custom()?.click())

    const hex = document.body.querySelector<HTMLInputElement>(
      'input[placeholder="#FF0000"]',
    )
    expect(hex).not.toBeNull()
  })

  test("the check and the preview text are white even on a light preset", async () => {
    await render("#FFC53D", "VIP")

    expect(
      swatch("#FFC53D")?.querySelector("svg")?.getAttribute("class"),
    ).toContain("text-white")
    expect(preview()?.style.color).toBe("rgb(255, 255, 255)")
  })

  test("the preview shows the typed name in the chosen color", async () => {
    await render("#13C2C2", "  VIP  ")

    expect(preview()?.textContent).toBe("VIP")
    expect(preview()?.style.backgroundColor).not.toBe("")
  })

  test("the preview falls back to a placeholder and stays neutral without a color", async () => {
    await render(null)

    expect(preview()?.textContent).toBe("previewPlaceholder")
    expect(preview()?.style.backgroundColor).toBe("")
  })

  test("there is no remove button, with or without a color", async () => {
    await render(null)
    const texts = () =>
      Array.from(container.querySelectorAll("button")).map(
        (button) => button.textContent,
      )

    expect(texts()).not.toContain("remove")
    await act(async () => swatch("#FF7A45")?.click())
    expect(texts()).not.toContain("remove")
    expect(latest.color).toBe("#FF7A45")
  })

  test("a tag without a color has nothing selected until one is picked", async () => {
    await render(null, "VIP")

    expect(container.querySelector('button[aria-pressed="true"]')).toBeNull()
    expect(preview()?.textContent).toBe("VIP")
    await act(async () => swatch("#9254DE")?.click())
    expect(swatch("#9254DE")?.getAttribute("aria-pressed")).toBe("true")
  })

  test("the preview label matches the field label and the pill is 12px regular", async () => {
    await render("#0E2F44", "VIP")

    const labels = Array.from(container.querySelectorAll("span")).filter(
      (el) => el.textContent === "label" || el.textContent === "previewLabel",
    )
    expect(labels).toHaveLength(2)
    expect(labels[0]?.className).toBe(labels[1]?.className)
    expect(preview()?.className).toContain("font-normal")
    expect(preview()?.className).toContain("text-xs")
    expect(preview()?.className).toContain("leading-4")
    expect(preview()?.className).toContain("rounded-xl")
    expect(preview()?.className).toContain("py-[3px]")
  })

  test("swatches sit in a wrapping row, 14px apart, with no hover effect", async () => {
    await render(null)

    const row = swatch(TAG_PRESET_COLORS[0])?.parentElement
    expect(row?.className).toContain("flex-wrap")
    expect(row?.className).toContain("gap-[14px]")
    expect(row?.className).not.toContain("justify-between")
    expect(swatch(TAG_PRESET_COLORS[0])?.className).not.toContain("mr-[14px]")
    expect(swatch(TAG_PRESET_COLORS[0])?.className).not.toContain("hover:")
  })

  test("the custom swatch has a dark-theme variant when it holds no color", async () => {
    await render(null)

    expect(custom()?.className).toContain("dark:bg-muted")
  })

  test("a nearly white custom color gets the muted text on the check and the preview", async () => {
    await render("#FAFAFA", "VIP")

    expect(custom()?.querySelector("svg")?.style.color).toBe(
      "rgb(102, 112, 133)",
    )
    expect(preview()?.style.color).toBe("rgb(102, 112, 133)")
  })

  test("a dark custom color keeps white on the check and the preview", async () => {
    await render("#123456", "VIP")

    expect(custom()?.querySelector("svg")?.style.color).toBe(
      "rgb(255, 255, 255)",
    )
    expect(preview()?.style.color).toBe("rgb(255, 255, 255)")
  })
})
