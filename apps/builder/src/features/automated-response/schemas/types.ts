import type { FlowResource } from "@/features/flows/schemas/get-flows-schema"
import { BaseException } from "@/lib/error"
import type { AutomatedResponse } from "@ahachat.ai/database/types"

export class AutomatedResponseException extends BaseException {}

export type AutomatedResponseResource = AutomatedResponse & {
  flow?: FlowResource
}

export type AutomatedResponseCollection = {
  data: AutomatedResponseResource[]
  pageCount: number
}
