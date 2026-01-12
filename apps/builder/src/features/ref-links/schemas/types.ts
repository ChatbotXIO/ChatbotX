import type { FieldModel, RefLinkModel } from "@aha.chat/database/types"
import type { FlowResource } from "@/features/flows/schemas/resource"
import { BaseException } from "@/lib/errors/exception"

export class RefLinkException extends BaseException {}

export type RefLinkResource = RefLinkModel & {
  flow?: FlowResource
  field?: FieldModel
}

export type RefLinkCollection = {
  data: RefLinkResource[]
  pageCount: number
}
