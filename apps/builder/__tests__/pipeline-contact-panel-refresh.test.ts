import { describe, expect, test } from "vitest"
import { concernsContact } from "../src/features/pipelines/lib/contact-panel-refresh"

describe("concernsContact", () => {
  test("an item event of this contact refreshes the panel", () => {
    expect(concernsContact({ contactId: "c1" }, "c1")).toBe(true)
  })

  test("another contact's item event does not", () => {
    expect(concernsContact({ contactId: "c2" }, "c1")).toBe(false)
  })

  test("pipeline-wide events and older publishers without a contact do", () => {
    expect(concernsContact({}, "c1")).toBe(true)
  })
})
