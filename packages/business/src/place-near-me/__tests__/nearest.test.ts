import { describe, expect, test } from "vitest"
import { haversineKm, pickNearestPlace } from "../nearest"

const place = (id: string, latitude: number, longitude: number) => ({
  id,
  name: `Place ${id}`,
  latitude,
  longitude,
})

describe("haversineKm", () => {
  test("Hanoi to HCMC is about 1137 km", () => {
    expect(
      haversineKm(
        { latitude: 21.0285, longitude: 105.8542 },
        { latitude: 10.8231, longitude: 106.6297 },
      ),
    ).toBeCloseTo(1137, -1)
  })

  test("same point is 0", () => {
    const point = {
      latitude: 16.007_884_630_447_4,
      longitude: 108.266_029_818_772_88,
    }
    expect(haversineKm(point, point)).toBe(0)
  })
})

describe("pickNearestPlace", () => {
  test("picks the closest", () => {
    const nearest = pickNearestPlace({ latitude: 10.8, longitude: 106.7 }, [
      place("1", 21.0285, 105.8542),
      place("2", 10.8231, 106.6297),
      place("3", 16.0544, 108.2022),
    ])
    expect(nearest?.id).toBe("2")
    expect(nearest?.distanceKm).toBeGreaterThan(0)
  })

  test("breaks ties by lower id", () => {
    const nearest = pickNearestPlace({ latitude: 0, longitude: 0 }, [
      place("10", 1, 0),
      place("9", -1, 0),
    ])
    expect(nearest?.id).toBe("9")
  })

  test("returns null for []", () => {
    expect(pickNearestPlace({ latitude: 0, longitude: 0 }, [])).toBeNull()
  })

  test("antimeridian", () => {
    const nearest = pickNearestPlace({ latitude: 0, longitude: 179.9 }, [
      place("1", 0, 170),
      place("2", 0, -179.9),
    ])
    expect(nearest?.id).toBe("2")
  })
})
