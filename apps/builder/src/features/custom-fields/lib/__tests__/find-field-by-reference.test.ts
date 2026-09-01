import { formatBotFieldReference } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import type { BotFieldResource } from "@/features/bot-fields/schema/resource"
import type { CustomFieldResource } from "../../schema/resource"
import { findFieldByReference } from "../find-field-by-reference"

const customFields = [
  { id: "1", name: "First Name", type: "shortText" },
  { id: "2", name: "Age", type: "number" },
] as CustomFieldResource[]

const botFields = [
  { id: "10", name: "Plan", type: "shortText" },
  { id: "11", name: "Renewal Date", type: "date" },
] as BotFieldResource[]

describe("findFieldByReference", () => {
  test("resolves a customField reference by id", () => {
    expect(findFieldByReference("1", { customFields, botFields })).toEqual({
      type: "shortText",
    })
  })

  test("resolves a customField reference by legacy name lookup", () => {
    expect(findFieldByReference("Age", { customFields, botFields })).toEqual({
      type: "number",
    })
  })

  test("resolves a bot_field: token against botFields by id", () => {
    expect(
      findFieldByReference(formatBotFieldReference("11"), {
        customFields,
        botFields,
      }),
    ).toEqual({ type: "date" })
  })

  test("never matches a bot_field: token against customFields", () => {
    expect(
      findFieldByReference(formatBotFieldReference("1"), {
        customFields,
        botFields,
      }),
    ).toBeUndefined()
  })

  test("returns undefined for an unknown customField reference", () => {
    expect(
      findFieldByReference("999", { customFields, botFields }),
    ).toBeUndefined()
  })

  test("returns undefined for an unknown bot field id", () => {
    expect(
      findFieldByReference(formatBotFieldReference("999"), {
        customFields,
        botFields,
      }),
    ).toBeUndefined()
  })

  test("returns undefined for a null or empty reference", () => {
    expect(
      findFieldByReference(null, { customFields, botFields }),
    ).toBeUndefined()
    expect(
      findFieldByReference("", { customFields, botFields }),
    ).toBeUndefined()
  })
})
