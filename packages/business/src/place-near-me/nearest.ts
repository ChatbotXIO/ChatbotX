const EARTH_RADIUS_KM = 6371

type Coordinates = { latitude: number; longitude: number }

export type NearestPlace = {
  id: string
  name: string
  latitude: number
  longitude: number
  distanceKm: number
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180

/** Great-circle distance in kilometres. */
export function haversineKm(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.latitude - a.latitude)
  const dLng = toRadians(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) *
      Math.cos(toRadians(b.latitude)) *
      Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** The closest place to `origin`; equal distances go to the lower id. */
export function pickNearestPlace(
  origin: Coordinates,
  places: readonly Omit<NearestPlace, "distanceKm">[],
): NearestPlace | null {
  let nearest: NearestPlace | null = null
  for (const place of places) {
    const distanceKm = haversineKm(origin, place)
    if (
      !nearest ||
      distanceKm < nearest.distanceKm ||
      (distanceKm === nearest.distanceKm &&
        BigInt(place.id) < BigInt(nearest.id))
    ) {
      nearest = { ...place, distanceKm }
    }
  }
  return nearest
}
