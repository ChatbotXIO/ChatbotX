import {
  createSelectSchema,
  organizationMemberModel,
} from "@aha.chat/database/schema"

export const organizationMemberResource = createSelectSchema(
  organizationMemberModel,
)
export const OrganizationMemberResource = organizationMemberResource
