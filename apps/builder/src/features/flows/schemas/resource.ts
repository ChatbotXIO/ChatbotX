import { createSelectSchema, flowModel } from "@aha.chat/database/schema"
import z from "zod"
import { BaseException } from "@/lib/errors/exception"

export class FlowException extends BaseException {}

export const flowResource = createSelectSchema(flowModel, {
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
export type FlowResource = z.infer<typeof flowResource>
