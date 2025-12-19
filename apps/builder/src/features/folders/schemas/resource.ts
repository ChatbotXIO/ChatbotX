import type { FolderModel } from "@aha.chat/database/types"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"
import { BaseException } from "@/lib/errors/exception"

export type FolderResource = FolderModel
export type FolderCollection = PaginatedResponse<FolderResource>

export class FolderException extends BaseException {}
