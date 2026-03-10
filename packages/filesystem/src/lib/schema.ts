export const DEFAULT_MIME_TYPE = "application/octet-stream"

export type UploadedFile = {
  name: string
  mimeType: string
  originPath: string
  size: number
  fileType: "image" | "video" | "audio" | "file"
  width?: number
  height?: number
}
