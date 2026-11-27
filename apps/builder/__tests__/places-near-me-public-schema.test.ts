import { describe, expect, test } from "vitest"
import {
  placeCategoryFormRequest,
  placeLocationFormRequest,
  updatePlaceCategoryPublicRequest,
  updatePlaceLocationPublicRequest,
} from "@/features/places-near-me/schema/public"

const loc = (latitude: unknown, longitude: unknown) =>
  placeLocationFormRequest.safeParse({ name: "HQ", latitude, longitude })

describe("placeLocationFormRequest", () => {
  test.each([
    [90, 180],
    [-90, -180],
    [16.007_884_630_447_4, 108.266_029_818_772_88],
  ])("accepts %s, %s unchanged", (lat, lng) => {
    const r = loc(lat, lng)
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.latitude).toBe(lat)
      expect(r.data.longitude).toBe(lng)
    }
  })

  test.each([
    [90.000_000_1, 0],
    [0, -180.5],
    ["16.0", 0],
    [Number.NaN, 0],
    [0, "108.2"],
  ])("rejects %s, %s", (lat, lng) => {
    expect(loc(lat, lng).success).toBe(false)
  })

  test("categoryId must be digits, null allowed", () => {
    const base = { name: "HQ", latitude: 1, longitude: 1 }
    expect(
      placeLocationFormRequest.safeParse({ ...base, categoryId: null }).success,
    ).toBe(true)
    expect(
      placeLocationFormRequest.safeParse({ ...base, categoryId: "abc" })
        .success,
    ).toBe(false)
  })
})

describe("placeCategoryFormRequest", () => {
  test("trims name and rejects rank below 1", () => {
    expect(placeCategoryFormRequest.parse({ name: "  A " }).name).toBe("A")
    expect(
      placeCategoryFormRequest.safeParse({ name: "A", rank: 0 }).success,
    ).toBe(false)
    expect(
      placeCategoryFormRequest.safeParse({ name: "A", rank: 1.5 }).success,
    ).toBe(false)
  })
})

describe("update requests need a field", () => {
  test("empty category / location patches are rejected", () => {
    expect(
      updatePlaceCategoryPublicRequest.safeParse({ id: "1" }).success,
    ).toBe(false)
    expect(
      updatePlaceLocationPublicRequest.safeParse({ id: "1" }).success,
    ).toBe(false)
    expect(
      updatePlaceCategoryPublicRequest.safeParse({ id: "1", rank: 2 }).success,
    ).toBe(true)
    expect(
      updatePlaceLocationPublicRequest.safeParse({ id: "1", categoryId: null })
        .success,
    ).toBe(true)
  })
})
