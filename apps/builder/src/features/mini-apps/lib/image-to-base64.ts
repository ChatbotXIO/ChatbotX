/**
 * Shrinks an uploaded image until its base64 fits `maxBase64Length`
 * (Flow JSON inlines images), re-encoding as JPEG. Returns bare base64
 * (no `data:` prefix), or undefined when it cannot be made small enough.
 */
export async function imageFileToBase64(
  file: File,
  maxBase64Length: number,
  maxDimension = 1024,
): Promise<string | undefined> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")
  if (!context) {
    return
  }
  let scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  for (let attempt = 0; attempt < 6; attempt++) {
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    for (const quality of [0.85, 0.7, 0.55]) {
      const base64 = canvas.toDataURL("image/jpeg", quality).split(",")[1] ?? ""
      if (base64.length <= maxBase64Length) {
        return base64
      }
    }
    scale *= 0.7
  }
  return
}

/** A `File` from bare base64, so a media-library image can be shrunk like an upload. */
export const base64ToFile = (base64: string, mimeType: string): File => {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new File([bytes], "image", { type: mimeType })
}
