import { describe, expect, test } from "vitest"
import { z } from "zod"
import {
  closestNames,
  formatZodPathSegment,
  zodErrorToFlowAuthoringErrors,
} from "../../src/authoring/errors"

const getInvalidSpecError = () => {
  const result = z
    .object({ items: z.array(z.object({ name: z.string().min(3) })) })
    .safeParse({ items: [{ name: "" }] })
  if (result.success) {
    throw new Error("expected schema parsing to fail")
  }
  return result.error
}

describe("closestNames", () => {
  test("returns an exact match", () => {
    expect(closestNames("welcome", ["welcome", "other"])).toEqual(["welcome"])
  })

  test("returns a typo match", () => {
    expect(closestNames("welcom_promo", ["welcome_promo"])).toEqual([
      "welcome_promo",
    ])
  })

  test("returns a prefix match", () => {
    expect(closestNames("wel", ["welcome_promo"])).toEqual(["welcome_promo"])
  })

  test("omits unrelated names", () => {
    expect(closestNames("welcome", ["archive", "assignment"])).toEqual([])
  })

  test("caps results at three candidates", () => {
    expect(
      closestNames("alpha", ["alpha", "alpha1", "alpha2", "alpha3"]),
    ).toEqual(["alpha", "alpha1", "alpha2"])
  })
})

describe("zodErrorToFlowAuthoringErrors", () => {
  test("uses a supplied path mapper", () => {
    const errors = zodErrorToFlowAuthoringErrors(
      getInvalidSpecError(),
      "invalidStep",
      (issuePath) => issuePath.join("/"),
    )

    expect(errors).toMatchObject([
      { code: "invalidStep", path: "items/0/name" },
    ])
  })

  test("uses the issue path without a mapper", () => {
    const errors = zodErrorToFlowAuthoringErrors(
      getInvalidSpecError(),
      "invalidSpec",
    )

    expect(errors).toMatchObject([
      { code: "invalidSpec", path: "items[0].name" },
    ])
  })

  test("falls back to the issue path when the mapper has no mapping", () => {
    const errors = zodErrorToFlowAuthoringErrors(
      getInvalidSpecError(),
      "invalidStep",
      () => undefined,
    )

    expect(errors).toMatchObject([
      { code: "invalidStep", path: "items[0].name" },
    ])
  })
})

describe("formatZodPathSegment", () => {
  test("formats object keys and array indices", () => {
    expect(formatZodPathSegment("steps", 0)).toBe("steps[0]")
    expect(formatZodPathSegment("steps[0]", "templateName")).toBe(
      "steps[0].templateName",
    )
  })
})
