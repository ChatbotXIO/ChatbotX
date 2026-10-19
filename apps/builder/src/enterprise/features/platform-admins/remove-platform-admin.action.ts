"use server"

import {
  assertEnterpriseFeatures,
  platformAdminService,
} from "@chatbotx.io/business"
import { superAdminActionClient } from "@/lib/safe-action"
import { removePlatformAdminSchema } from "./schema"

export const removePlatformAdminAction = superAdminActionClient
  .inputSchema(removePlatformAdminSchema)
  .action(async ({ ctx, parsedInput }) => {
    await assertEnterpriseFeatures()
    await platformAdminService.remove({
      actorId: ctx.user.id,
      userId: parsedInput.userId,
    })
  })
