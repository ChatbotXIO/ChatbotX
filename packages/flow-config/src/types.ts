export const UploadMode = {
  file: "file",
  link: "link",
} as const
export type UploadMode = (typeof UploadMode)[keyof typeof UploadMode]

export const CardLayout = {
  horizontal: "horizontal",
  vertical: "vertical",
} as const
export type CardLayout = (typeof CardLayout)[keyof typeof CardLayout]
