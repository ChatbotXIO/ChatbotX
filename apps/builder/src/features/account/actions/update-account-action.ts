"use server"

import { db, eq } from "@chatbotx.io/database/client"
import { userModel } from "@chatbotx.io/database/schema"
import { revalidatePath } from "next/cache"
import { authActionClient } from "@/lib/safe-action"
import {
  type UpdateAccountRequest,
  updateAccountSchema,
} from "../schema/update-account-schema"

export const updateAccountAction = authActionClient
  .inputSchema(updateAccountSchema)
  .action(
    async ({
      parsedInput,
      ctx,
    }: {
      parsedInput: UpdateAccountRequest
      ctx: { user: { id: string } }
    }) => {
      const fullName = [
        parsedInput.firstName.trim(),
        parsedInput.lastName?.trim(),
      ]
        .filter(Boolean)
        .join(" ")
      await db
        .update(userModel)
        .set({ name: fullName })
        .where(eq(userModel.id, ctx.user.id))
      revalidatePath("/space", "layout")
    },
  )
