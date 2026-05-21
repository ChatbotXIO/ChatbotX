"use server"

import { credentialService } from "@chatbotx.io/business"
import {
  type ZaloCredential,
  type ZaloCredentialUpdate,
  zaloCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import type { UserModel } from "@chatbotx.io/database/types"
import { getTranslations } from "next-intl/server"

import { orgAdminActionClient } from "@/lib/safe-action"

export const updateZaloSettingsAction = orgAdminActionClient
  .inputSchema(zaloCredentialUpdateSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { user: UserModel }
      parsedInput: ZaloCredentialUpdate
    }) => {
      const existing = await credentialService.findDecryptedForUser({
        userId: ctx.user.id,
        type: "zalo",
      })

      const t = await getTranslations()

      const clientSecret =
        parsedInput.clientSecret || existing?.config.clientSecret
      if (!clientSecret) {
        throw new Error(t("organizationSettings.errors.zaloAppSecretRequired"))
      }

      const config: ZaloCredential = {
        clientId: parsedInput.clientId,
        version: parsedInput.version,
        verifyToken: parsedInput.verifyToken,
        clientSecret,
      }

      await credentialService.upsertForUser({
        userId: ctx.user.id,
        type: "zalo",
        config,
      })
    },
  )
