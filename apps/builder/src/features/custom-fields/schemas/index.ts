import { BaseException } from "@/lib/error"
import type { FieldModel } from "@ahachat.ai/database/types"

export class FieldException extends BaseException {}

export type CustomFieldResource = FieldModel

export type CustomFieldCollection = {
  data: CustomFieldResource[]
  pageCount: number
}
