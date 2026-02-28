import type { AutomatedResponseModel } from "@aha.chat/database/types"
import type { FlowResource } from "@/features/flows/schemas/resource"
import { BaseException } from "@/lib/errors/exception"

export class AutomatedResponseException extends BaseException {}

export type AutomatedResponseResource = AutomatedResponseModel & {
  flow?: FlowResource
}
