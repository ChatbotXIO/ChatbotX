// @vitest-environment jsdom

import { NextIntlClientProvider } from "next-intl"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import messages from "../messages/en.json"
import { InstallSourceBadge } from "../src/features/templates/components/install-source-badge"

describe("InstallSourceBadge", () => {
  let container: HTMLDivElement
  let root: Root

  const render = (installSource: "manual" | "tenantDefault") =>
    act(() =>
      root.render(
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <InstallSourceBadge installSource={installSource} />
        </NextIntlClientProvider>,
      ),
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

  test("marks a copy a white-label default installed, with the long form as its title", () => {
    render("tenantDefault")

    const badge = container.querySelector("[title]")
    expect(badge?.textContent).toBe(messages.templates.installers.automatic)
    expect(badge?.getAttribute("title")).toBe(
      messages.templates.installs.installedAutomatically,
    )
  })

  test("shows nothing for a copy the installer chose", () => {
    render("manual")

    expect(container.textContent).toBe("")
  })
})
