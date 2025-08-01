import { BaseException } from "@/lib/error"
import type { FieldModel } from "@aha.chat/database/types"

export class FieldException extends BaseException {}

export type CustomFieldResource = FieldModel

export type CustomFieldCollection = {
  data: CustomFieldResource[]
  pageCount: number
}
