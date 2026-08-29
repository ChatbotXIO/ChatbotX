import { describe, expect, it } from "vitest"
import { buildBotFieldPromptVariableOptions } from "@/components/tiptap/use-prompt-variable-options"

describe("buildBotFieldPromptVariableOptions", () => {
  it("builds one option per bot field, using bot_field:<id> as the value and the field's name as the label", () => {
    const options = buildBotFieldPromptVariableOptions(
      [
        { id: "1", name: "Support Hours" },
        { id: "2", name: "Store Address" },
      ],
      "Bot Fields",
    )

    expect(options).toEqual([
      { label: "Support Hours", value: "bot_field:1", group: "Bot Fields" },
      { label: "Store Address", value: "bot_field:2", group: "Bot Fields" },
    ])
  })

  it("returns an empty list for an empty bot field list", () => {
    expect(buildBotFieldPromptVariableOptions([], "Bot Fields")).toEqual([])
  })

  it("never inserts by name — the value is always the id-based reference token", () => {
    const [option] = buildBotFieldPromptVariableOptions(
      [{ id: "42", name: "Refund Policy" }],
      "Bot Fields",
    )

    expect(option?.value).toBe("bot_field:42")
    expect(option?.value).not.toBe("Refund Policy")
  })
})
