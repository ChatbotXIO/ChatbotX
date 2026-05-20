import { z } from "zod"

export const uploadTypes = z.enum(["import", "generic"])
export type UploadTypes = z.infer<typeof uploadTypes>

export const fileTypes = z.enum(["image", "video", "audio", "gif", "file"])
export type FileType = z.infer<typeof fileTypes>

export const fileContextTypes = z.enum(["import", "generic", "export"])
export type FileContextType = z.infer<typeof fileContextTypes>

export const fileStatuses = z.enum(["pending", "uploaded", "failed"])
export type FileStatus = z.infer<typeof fileStatuses>

export const exportSubTypes = z.enum(["contacts"])
export type ExportSubType = z.infer<typeof exportSubTypes>
