import { createSelectSchema, flowModel } from "@chatbotx.io/database/schema"
import z from "zod"

export const flowResource = createSelectSchema(flowModel, {
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
export type FlowResource = z.infer<typeof flowResource>
