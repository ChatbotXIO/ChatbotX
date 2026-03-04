import type { BroadcastModel, FlowModel } from "@aha.chat/database/types"
import { BaseException } from "@/lib/errors/exception"

export class BroadcastException extends BaseException {}

export type BroadcastResource = BroadcastModel & {
  flow?: FlowModel
  contactsCount?: number
}
