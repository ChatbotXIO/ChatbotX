import { createSelectSchema, flowVersionModel } from "@aha.chat/database/schema"
import type z from "zod"

export const flowVersionResource = createSelectSchema(flowVersionModel).omit({
  createdAt: true,
  updatedAt: true,
})
export type FlowVersionResource = z.infer<typeof flowVersionResource>
