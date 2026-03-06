import { createSelectSchema, flowModel } from "@aha.chat/database/schema"
import type z from "zod"
import { BaseException } from "@/lib/errors/exception"

export class FlowException extends BaseException {}

export const flowResource = createSelectSchema(flowModel)
export type FlowResource = z.infer<typeof flowResource>
