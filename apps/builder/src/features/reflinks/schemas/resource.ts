import { createSelectSchema, reflinkModel } from "@chatbotx.io/database/schema"
import type z from "zod"

export const reflinkResource = createSelectSchema(reflinkModel)
export type ReflinkResource = z.infer<typeof reflinkResource>
