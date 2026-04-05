import {
  createSelectSchema,
  organizationModel,
} from "@chatbotx.io/database/schema"
import z from "zod"

export const organizationResource = createSelectSchema(organizationModel, {
  id: z.string(),
})
export type OrganizationResource = z.infer<typeof organizationResource>
