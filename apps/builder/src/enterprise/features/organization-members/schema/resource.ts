import {
  createSelectSchema,
  organizationMemberModel,
} from "@chatbotx.io/database/schema"
import z from "zod"

export const organizationMemberResource = createSelectSchema(
  organizationMemberModel,
  {
    id: z.string(),
    userId: z.string(),
    organizationId: z.string(),
  },
)
export const OrganizationMemberResource = organizationMemberResource
