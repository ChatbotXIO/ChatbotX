"use server"

import {
  assertEnterpriseFeatures,
  platformCredentialService,
} from "@chatbotx.io/business"
import {
  type SmtpCredential,
  smtpCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import { verifySmtpTransport } from "@/features/integration-smtp/lib/verify-connection"
import { superAdminActionClient } from "@/lib/safe-action"

export const updatePlatformSmtpAction = superAdminActionClient
  .inputSchema(smtpCredentialUpdateSchema)
  .action(async ({ parsedInput }) => {
    await assertEnterpriseFeatures()
    const t = await getTranslations()

    const existing = await platformCredentialService.findDecryptedPlatform({
      type: "smtp",
    })

    const password = parsedInput.password || existing?.config.password
    if (!password) {
      return returnValidationErrors(smtpCredentialUpdateSchema, {
        password: {
          _errors: [t("platformAdmin.smtp.errors.passwordRequired")],
        },
      })
    }

    const { host, port, username, fromEmail, fromName } = parsedInput

    await verifySmtpTransport({ host, port, username, password })

    const config: SmtpCredential = {
      host,
      port,
      username,
      password,
      fromEmail,
      fromName,
    }

    await platformCredentialService.upsertPlatform({ type: "smtp", config })
  })
