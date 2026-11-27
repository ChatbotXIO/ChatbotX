import { describe, expect, test } from "vitest"
import { findMissingRequiredPipelineFields } from "../src"

const fields = [
  { id: "1", name: "Budget", required: true },
  { id: "2", name: "Notes", required: false },
  { id: "3", name: "Company", required: true },
]

describe("findMissingRequiredPipelineFields", () => {
  test("lists every required field without a row, in definition order", () => {
    expect(
      findMissingRequiredPipelineFields([], fields).map((field) => field.name),
    ).toEqual(["Budget", "Company"])
  })

  test("a blank or whitespace-only value counts as missing", () => {
    const missing = findMissingRequiredPipelineFields(
      [
        { pipelineFieldId: "1", value: "   " },
        { pipelineFieldId: "3", value: "" },
      ],
      fields,
    )
    expect(missing.map((field) => field.id)).toEqual(["1", "3"])
  })

  test("a literal value or a {{variable}} satisfies the field", () => {
    expect(
      findMissingRequiredPipelineFields(
        [
          { pipelineFieldId: "1", value: "1000" },
          { pipelineFieldId: "3", value: "{{company}}" },
        ],
        fields,
      ),
    ).toEqual([])
  })

  test("optional fields are never reported", () => {
    expect(
      findMissingRequiredPipelineFields(
        [],
        [{ id: "2", name: "Notes", required: false }],
      ),
    ).toEqual([])
  })

  test("with several rows for one field the last one decides, like the action", () => {
    const filledThenBlank = findMissingRequiredPipelineFields(
      [
        { pipelineFieldId: "1", value: "500" },
        { pipelineFieldId: "1", value: "" },
      ],
      fields,
    )
    const blankThenFilled = findMissingRequiredPipelineFields(
      [
        { pipelineFieldId: "1", value: "" },
        { pipelineFieldId: "1", value: "500" },
      ],
      fields,
    )

    expect(filledThenBlank.map((field) => field.id)).toContain("1")
    expect(blankThenFilled.map((field) => field.id)).not.toContain("1")
  })
})
