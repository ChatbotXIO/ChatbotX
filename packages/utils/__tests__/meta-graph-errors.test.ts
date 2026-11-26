import { describe, expect, test } from "vitest"
import { createGraphFailureMapper } from "../src/meta-graph-errors"

const map = createGraphFailureMapper({ networkLabel: "Facebook" })

describe("createGraphFailureMapper duplicate post", () => {
  // Graph error 506: "Duplicate status updates cannot be posted consecutively."
  test("506 is a rejected payload that proves nothing was created", () => {
    const result = map(
      400,
      { error: { code: 506, message: "Duplicate Post" } },
      "tok",
    )
    expect(result).toMatchObject({
      category: "payloadInvalid",
      code: "duplicatePost",
      provablyNotCreated: true,
    })
    expect(result.message).toContain("already")
  })

  test("an unknown code still needs review", () => {
    const result = map(400, { error: { code: 99_999, message: "x" } }, "tok")
    expect(result).toMatchObject({
      category: "unknown",
      provablyNotCreated: false,
    })
  })
})
