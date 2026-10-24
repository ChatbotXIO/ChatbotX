"use server"

import {
  assertEnterpriseFeatures,
  platformAdminService,
} from "@chatbotx.io/business"
import { superAdminActionClient } from "@/lib/safe-action"
import { addPlatformAdminSchema } from "./schema"

export const addPlatformAdminAction = superAdminActionClient
  .inputSchema(addPlatformAdminSchema)
  .action(async ({ ctx, parsedInput }) => {
    await assertEnterpriseFeatures()
    return await platformAdminService.add({
      actorId: ctx.user.id,
      email: parsedInput.email,
      role: parsedInput.role,
    })
  })
