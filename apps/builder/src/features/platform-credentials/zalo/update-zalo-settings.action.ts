"use server"

import { platformCredentialService } from "@chatbotx.io/business"
import {
  type ZaloCredential,
  type ZaloCredentialUpdate,
  zaloCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import type { UserModel } from "@chatbotx.io/database/types"
import { getTranslations } from "next-intl/server"

import { isCloud } from "@/env"
import { authActionClient } from "@/lib/safe-action"

export const updateZaloSettingsAction = authActionClient
  .inputSchema(zaloCredentialUpdateSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { user: UserModel }
      parsedInput: ZaloCredentialUpdate
    }) => {
      const scopedUserId = isCloud() ? ctx.user.id : undefined
      const existing = await platformCredentialService.findDecrypted({
        userId: scopedUserId,
        type: "zalo",
      })

      const t = await getTranslations()

      const clientSecret =
        parsedInput.clientSecret || existing?.config.clientSecret
      if (!clientSecret) {
        throw new Error(t("platformSettings.errors.zaloAppSecretRequired"))
      }

      const config: ZaloCredential = {
        clientId: parsedInput.clientId,
        version: parsedInput.version,
        verifyToken: parsedInput.verifyToken,
        clientSecret,
      }

      await platformCredentialService.upsert({
        userId: scopedUserId,
        type: "zalo",
        config,
      })
    },
  )
