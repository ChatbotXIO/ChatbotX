import { createSelectSchema, triggerModel } from "@aha.chat/database/schema"
import type { z } from "zod"

export const triggerResource = createSelectSchema(triggerModel)
export type TriggerResource = z.infer<typeof triggerResource>
