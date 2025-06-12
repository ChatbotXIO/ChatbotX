import { BaseException } from "@/lib/error"
import type { Field } from "@ahachat.ai/database"

export class FieldException extends BaseException {}

export type CustomFieldResource = Field

export type CustomFieldCollection = {
  data: CustomFieldResource[]
  pageCount: number
}
