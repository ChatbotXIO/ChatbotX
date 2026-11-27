import { describe, expect, test } from "vitest"
import { warningLabel } from "@/features/templates/lib/warning-label"

const messages: Record<string, string> = {
  "templates.warningCodes.flowNotPublished": "The flow is a draft.",
  "templates.warningCodes.unlisted": "Not fully brought over: {code}",
}

const t = Object.assign(
  (key: string, values?: Record<string, string>) =>
    (messages[key] ?? key).replace("{code}", values?.code ?? ""),
  { has: (key: string) => key in messages },
)

describe("warningLabel", () => {
  test("uses the message of a code the install raises itself", () => {
    expect(warningLabel(t, "flowNotPublished")).toBe("The flow is a draft.")
  })

  test("an unresolved reference kind with no message of its own shows the code in the fallback", () => {
    expect(warningLabel(t, "sequence")).toBe("Not fully brought over: sequence")
    expect(warningLabel(t, "aiAgent")).toBe("Not fully brought over: aiAgent")
  })
})
