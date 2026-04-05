import { z } from "zod"

export const fileTypes = z.enum(["image", "video", "audio", "gif", "file"])
export type FileType = z.infer<typeof fileTypes>
