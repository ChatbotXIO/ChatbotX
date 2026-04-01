import { z } from "zod"

export const uploadModes = z.enum(["url", "file"])
export type UploadMode = z.infer<typeof uploadModes>

export const cardLayouts = z.enum(["horizontal", "vertical"])
export type CardLayout = z.infer<typeof cardLayouts>
