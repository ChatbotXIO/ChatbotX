// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { AddAction } from "@/features/triggers/add-action"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ""
})

const openMenuLabels = (
  allowedTypes?: Parameters<typeof AddAction>[0]["allowedTypes"],
): string[] => {
  act(() => {
    root.render(<AddAction allowedTypes={allowedTypes} onAdd={vi.fn()} />)
  })
  const trigger = container.querySelector("button")
  act(() => {
    trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  })
  return Array.from(document.querySelectorAll('[role="menuitem"]')).map(
    (item) => item.textContent ?? "",
  )
}

describe("AddAction allowedTypes", () => {
  test("offers every action when no allowlist is given (trigger editor unchanged)", () => {
    const labels = openMenuLabels()

    expect(labels).toContain("trigger.actions.sendMetaCapiEvent")
    expect(labels).toContain("trigger.actions.addTag")
    expect(labels).toHaveLength(11)
    expect(labels).toContain("flows.actions.pipeline")
    expect(labels).toContain("trigger.actions.startExternalStep")
  })

  test("offers only the allowlisted actions", () => {
    const labels = openMenuLabels(["addTag", "startAnotherFlow"])

    // The allowlist preserves the picker's defined order.
    expect(labels).toEqual([
      "trigger.actions.startAnotherFlow",
      "trigger.actions.addTag",
    ])
  })

  test("lists the actions in the defined order, ChatbotX-only ones last", () => {
    expect(openMenuLabels()).toEqual([
      "trigger.actions.startAnotherFlow",
      "trigger.actions.startExternalStep",
      "trigger.actions.addTag",
      "trigger.actions.removeTag",
      "trigger.actions.setCustomField",
      "trigger.actions.clearCustomField",
      "trigger.actions.transferConversationToHuman",
      "flows.actions.pipeline",
      "Google Sheets",
      "trigger.actions.sendMetaCapiEvent",
      "trigger.actions.sendGoogleAdsConversion",
    ])
  })
})
