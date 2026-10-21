"use server"

import {
  adminWorkspaceService,
  assertEnterpriseFeatures,
} from "@chatbotx.io/business"
import { isCommunity } from "@/env"
import { getSuperAdminPermissions } from "@/features/workspace-members/helpers"
import { superAdminActionClient } from "@/lib/safe-action"
import { createAdminWorkspaceSchema } from "./schema"

export const createAdminWorkspaceAction = superAdminActionClient
  .inputSchema(createAdminWorkspaceSchema)
  .action(async ({ ctx, parsedInput }) => {
    await assertEnterpriseFeatures()

    // Defense in depth, matching `acceptInvitationAction`: this action is
    // already gated behind `assertEnterpriseFeatures()` above, so community
    // never actually reaches here — but a community worker reusing the
    // service directly must never grant restricted permissions.
    const permissions = isCommunity()
      ? getSuperAdminPermissions()
      : parsedInput.permissions

    return await adminWorkspaceService.createWithMembers({
      actorId: ctx.user.id,
      name: parsedInput.name,
      ownerEmail: parsedInput.ownerEmail,
      memberEmails: parsedInput.memberEmails,
      permissions,
    })
  })
