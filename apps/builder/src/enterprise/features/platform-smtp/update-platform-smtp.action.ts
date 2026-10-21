"use server"

import {
  assertEnterpriseFeatures,
  platformCredentialService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  type SmtpCredential,
  smtpCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import { createSmtpTransporter } from "@chatbotx.io/mail/transport"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
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

    const transporter = createSmtpTransporter({
      host,
      port,
      username,
      password,
    })
    try {
      await transporter.verify()
    } catch {
      throw new ChatbotXException(t("smtp.errors.connectionFailed"))
    } finally {
      transporter.close()
    }

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
