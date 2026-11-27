import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { getUserDataStepDefaultFn, stepTypes } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import { sendMessageEditorMenus } from "@/features/flows/react-flow/nodes/send-message/menu"
import type { TranslationFn } from "@/features/flows/react-flow/nodes/types"

const MESSAGES_DIR = path.join(import.meta.dirname, "..", "messages")

function translatorFor(skipLabel: string): TranslationFn {
  return ((key: string) =>
    key === "states.skip" ? skipLabel : key) as unknown as TranslationFn
}

function getUserDataMenuItem(t: TranslationFn) {
  const item = sendMessageEditorMenus(t).find(
    (menuItem) => menuItem.stepType === stepTypes.enum.getUserData,
  )
  if (!item) {
    throw new Error("Get User Data is missing from the Send Message menu")
  }
  return item
}

describe("Get User Data menu item", () => {
  test.each([
    ["English", "Skip"],
    ["Vietnamese", "Bỏ qua"],
  ])("a new step starts with the Skip label in the UI language (%s)", (_language, label) => {
    const item = getUserDataMenuItem(translatorFor(label))

    const step = getUserDataStepDefaultFn(item.props)

    expect(step.skipButtonLabel).toBe(label)
  })

  test("the label is author copy the step keeps editable, not a fixed string", () => {
    const item = getUserDataMenuItem(translatorFor("Bỏ qua"))

    expect(getUserDataStepDefaultFn(item.props).skipButtonLabel).not.toBe(
      "Skip",
    )
    expect(getUserDataStepDefaultFn().skipButtonLabel).toBe("Skip")
  })
})

describe("states.skip translation", () => {
  const localeFiles = readdirSync(MESSAGES_DIR).filter(
    (file) => file.endsWith(".json") && !file.endsWith(".d.json"),
  )

  test("exists in every locale, so a new step's default label is never empty", () => {
    expect(localeFiles.length).toBeGreaterThan(1)

    const missing = localeFiles.filter((file) => {
      const messages = JSON.parse(
        readFileSync(path.join(MESSAGES_DIR, file), "utf8"),
      ) as { states?: { skip?: unknown } }
      const label = messages.states?.skip
      return typeof label !== "string" || label.trim().length === 0
    })

    expect(missing).toEqual([])
  })
})
