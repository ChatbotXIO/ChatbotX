import type { FieldModel, ReflinkModel } from "@aha.chat/database/types"
import type { FlowResource } from "@/features/flows/schemas/get-flows-schema"
import { BaseException } from "@/lib/errors/exception"

export class ReflinkException extends BaseException {}

export type ReflinkResource = ReflinkModel & {
  flow?: FlowResource
  field?: FieldModel
}

export type ReflinkCollection = {
  data: ReflinkResource[]
  pageCount: number
}
