// @vitest-environment jsdom

import { NextIntlClientProvider } from "next-intl"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { TemplateInstallationWarnings } from "@/features/templates/components/template-installation-warnings"
import messages from "../messages/en.json"

const groups = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    category: "flows",
    sourceId: String(index),
    name: `flow-${index}`,
    skipped: false,
    issues: [{ code: "referenceRemoved", count: 2 }],
  }))

describe("template installation warnings", () => {
  let container: HTMLDivElement
  let root: Root

  const render = (count: number) =>
    act(() =>
      root.render(
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <TemplateInstallationWarnings groups={groups(count)} />
        </NextIntlClientProvider>,
      ),
    )
  const rows = () => container.querySelectorAll("ul.divide-y > li")
  const button = (label: string) =>
    Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === label,
    )

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("shows ten at a time and walks the pages", () => {
    render(25)

    expect(rows()).toHaveLength(10)
    expect(container.textContent).toContain("flow-9")
    expect(container.textContent).not.toContain("flow-10")
    expect(container.textContent).toContain("(2)")
    expect(button("Prev")?.disabled).toBe(true)
    expect(container.textContent).toContain("1 / 3")

    act(() => button("Next")?.click())
    act(() => button("Next")?.click())

    expect(rows()).toHaveLength(5)
    expect(container.textContent).toContain("flow-24")
    expect(button("Next")?.disabled).toBe(true)
  })

  test("has no pager for one page", () => {
    render(4)

    expect(button("Next")).toBeUndefined()
  })
})
