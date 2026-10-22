"use server"

import {
  adminWorkspaceService,
  assertEnterpriseFeatures,
} from "@chatbotx.io/business"
import { superAdminActionClient } from "@/lib/safe-action"
import { createAdminWorkspaceSchema } from "./schema"

export const createAdminWorkspaceAction = superAdminActionClient
  .inputSchema(createAdminWorkspaceSchema)
  .action(async ({ ctx, parsedInput }) => {
    await assertEnterpriseFeatures()

    return await adminWorkspaceService.createWithMembers({
      actorId: ctx.user.id,
      name: parsedInput.name,
      ownerEmail: parsedInput.ownerEmail,
      memberEmails: parsedInput.memberEmails,
      permissions: parsedInput.permissions,
    })
  })
