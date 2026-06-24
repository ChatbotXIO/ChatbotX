"use server"

import { db, eq } from "@chatbotx.io/database/client"
import { userModel } from "@chatbotx.io/database/schema"
import { authActionClient } from "@/lib/safe-action"

export const clearMustChangePasswordAction = authActionClient.action(
  async ({ ctx }) => {
    await db
      .update(userModel)
      .set({ mustChangePassword: false })
      .where(eq(userModel.id, ctx.user.id))

    return { ok: true }
  },
)
