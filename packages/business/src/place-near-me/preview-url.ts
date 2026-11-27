export const buildGoogleMapsPreviewUrl = (
  latitude: number,
  longitude: number,
): string =>
  `https://www.google.com/maps/search/?api=1&query=${String(latitude)}%2C${String(longitude)}`
