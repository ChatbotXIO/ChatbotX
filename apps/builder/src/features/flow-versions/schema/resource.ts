import { createSelectSchema, flowVersionModel } from "@aha.chat/database/schema"
import type z from "zod"

export const flowVersionResourece = createSelectSchema(flowVersionModel)
export type FlowVersionResource = z.infer<typeof flowVersionResourece>
