import { describe, expect, test } from "vitest"
import { parseCoordinatePair } from "../src/coordinates"

describe("parseCoordinatePair", () => {
  test("round-trips a stored pin exactly", () => {
    expect(parseCoordinatePair("16.0078846304474,108.26602981877288")).toEqual({
      latitude: 16.007_884_630_447_4,
      longitude: 108.266_029_818_772_88,
    })
  })

  test("parses negatives and tolerates whitespace", () => {
    expect(parseCoordinatePair(" -33.8688 ,151.2093 ")).toEqual({
      latitude: -33.8688,
      longitude: 151.2093,
    })
  })

  test("rejects non-coordinates, out-of-range values and single numbers", () => {
    expect(parseCoordinatePair("abc")).toBeNull()
    expect(parseCoordinatePair("91, 10")).toBeNull()
    expect(parseCoordinatePair("10, 181")).toBeNull()
    expect(parseCoordinatePair("16.0078")).toBeNull()
  })
})
