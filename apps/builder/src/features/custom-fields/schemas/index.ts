import type { FieldModel } from "@aha.chat/database/types"
import { BaseException } from "@/lib/errors/exception"

export class FieldException extends BaseException {}

export type CustomFieldResource = FieldModel

export type CustomFieldCollection = {
  data: CustomFieldResource[]
  pageCount: number
}
