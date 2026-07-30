import { describe, expect, test } from "vitest"
import {
  isDefiniteMetaRequestRejection,
  MetaCatalogException,
} from "../src/exception"

describe("Meta Catalog error classification", () => {
  test("classifies only Graph parameter validation as a definite rejection", () => {
    expect(
      isDefiniteMetaRequestRejection(
        new MetaCatalogException("Invalid parameter", 400, 100),
      ),
    ).toBe(true)

    expect(
      isDefiniteMetaRequestRejection(
        new MetaCatalogException("Rate limited", 429, 4),
      ),
    ).toBe(false)
    expect(
      isDefiniteMetaRequestRejection(
        new MetaCatalogException("Server error", 500),
      ),
    ).toBe(false)
    expect(isDefiniteMetaRequestRejection(new Error("Connection reset"))).toBe(
      false,
    )
  })
})
