"use server"

import {
  templateInstallIntentService,
  templateService,
} from "@chatbotx.io/business"
import { cookies } from "next/headers"
import { z } from "zod"
import { authActionClient } from "@/lib/safe-action"
import {
  INSTALL_INTENT_MARKER_COOKIE,
  INSTALL_INTENT_MARKER_MAX_AGE_SECONDS,
} from "../lib/install-intent-marker"
import { shareTokenSchema } from "../schema/shared"

/** "Create a new workspace" on a share page: that template goes into it. */
export const rememberTemplateInstallIntentAction = authActionClient
  .inputSchema(z.object({ shareToken: shareTokenSchema }))
  .action(async ({ ctx, parsedInput: { shareToken } }) => {
    if (!(await templateService.findPublicByShareToken(shareToken))) {
      return
    }
    await templateInstallIntentService.remember({
      userId: ctx.user.id,
      shareToken,
    })
    const cookieStore = await cookies()
    cookieStore.set(INSTALL_INTENT_MARKER_COOKIE, "1", {
      maxAge: INSTALL_INTENT_MARKER_MAX_AGE_SECONDS,
      path: "/",
      sameSite: "lax",
    })
  })

export const clearTemplateInstallIntentAction = authActionClient.action(
  async ({ ctx }) => {
    await templateInstallIntentService.clear(ctx.user.id)
    const cookieStore = await cookies()
    cookieStore.delete(INSTALL_INTENT_MARKER_COOKIE)
  },
)
