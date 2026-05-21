"use server"

import { organizationService } from "@chatbotx.io/business"
import type { OrganizationModel } from "@chatbotx.io/database/types"
import { orgAdminActionClient } from "@/lib/safe-action"
import {
  type UpdateOrganizationSchema,
  updateOrganizationSchema,
} from "./schema"

export const updateOrganizationAction = orgAdminActionClient
  .inputSchema(updateOrganizationSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { organization: OrganizationModel }
      parsedInput: UpdateOrganizationSchema
    }) => {
      const {
        logo: { url },
        ...rest
      } = parsedInput
      await organizationService.update({
        id: ctx.organization.id,
        data: {
          ...rest,
          logo: url,
        },
      })
    },
  )
