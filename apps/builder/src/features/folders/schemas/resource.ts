import { createSelectSchema, folderModel } from "@aha.chat/database/schema"
import type z from "zod"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"

export const folderResource = createSelectSchema(folderModel)
export type FolderResource = z.infer<typeof folderResource>

export type FolderCollection = PaginatedResponse<FolderResource>
