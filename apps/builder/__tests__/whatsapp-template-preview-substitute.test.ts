import { describe, expect, test } from "vitest"
import { substituteTemplateText } from "@/features/integration-whatsapp/message-templates/components/template-preview-utils"

describe("substituteTemplateText", () => {
  test("substitutes each positional placeholder with its own param, not the last one", () => {
    // Regression: a global replace used to collapse every placeholder to the
    // last param's value, rendering "Hi {{phone}} ... {{phone}} ... {{phone}}".
    const result = substituteTemplateText(
      "Hi {{1}}, your address was updated to {{2}}. Contact {{3}}.",
      [
        { text: "{{first_name}}" },
        { text: "{{email}}" },
        { text: "{{phone}}" },
      ],
    )

    expect(result).toBe(
      "Hi {{first_name}}, your address was updated to {{email}}. Contact {{phone}}.",
    )
  })

  test("substitutes named placeholders in order of appearance", () => {
    const result = substituteTemplateText(
      "Hi {{first_name}}, order {{order_id}}",
      [{ text: "{{full_name}}" }, { text: "{{order_no}}" }],
    )

    expect(result).toBe("Hi {{full_name}}, order {{order_no}}")
  })

  test("does not re-scan an injected value that itself looks like a placeholder", () => {
    // param.text is a variable token containing braces; it must survive intact.
    const result = substituteTemplateText("{{1}} then {{2}}", [
      { text: "{{first_name}}" },
      { text: "{{email}}" },
    ])

    expect(result).toBe("{{first_name}} then {{email}}")
  })

  test("keeps the placeholder when the matching param is missing", () => {
    const result = substituteTemplateText("Hi {{1}} {{2}}", [
      { text: "{{name}}" },
    ])

    expect(result).toBe("Hi {{name}} {{2}}")
  })

  test("keeps the placeholder when the param text is empty", () => {
    const result = substituteTemplateText("Hi {{1}}", [{ text: "" }])

    expect(result).toBe("Hi {{1}}")
  })

  test("consumes one param per placeholder occurrence when a placeholder repeats", () => {
    const result = substituteTemplateText("{{1}} and {{1}}", [
      { text: "A" },
      { text: "B" },
    ])

    expect(result).toBe("A and B")
  })

  test("returns text unchanged when there are no placeholders", () => {
    expect(substituteTemplateText("no variables here", [{ text: "X" }])).toBe(
      "no variables here",
    )
  })
})
