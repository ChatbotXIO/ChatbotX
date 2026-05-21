"use server"

import { organizationCredentialService } from "@chatbotx.io/business"
import {
  type GiphyCredential,
  type GiphyCredentialUpdate,
  giphyCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import type { OrganizationModel } from "@chatbotx.io/database/types"
import ky from "ky"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"

import { logger } from "@/lib/log"
import { orgAdminActionClient } from "@/lib/safe-action"

const isValidGiphyApiKey = async (apiKey: string) => {
  try {
    await ky.get("https://api.giphy.com/v1/gifs/random", {
      searchParams: {
        api_key: apiKey,
      },
    })
    return true
  } catch (error) {
    logger.error(error, "Invalid GIPHY API key")
    return false
  }
}

export const updateGiphySettingsAction = orgAdminActionClient
  .inputSchema(giphyCredentialUpdateSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { organization: OrganizationModel }
      parsedInput: GiphyCredentialUpdate
    }) => {
      const existing = await organizationCredentialService.findDecrypted({
        organizationId: ctx.organization.id,
        type: "giphy",
      })

      if (parsedInput.apiKey) {
        const isValid = await isValidGiphyApiKey(parsedInput.apiKey)
        if (!isValid) {
          const t = await getTranslations()
          return returnValidationErrors(giphyCredentialUpdateSchema, {
            apiKey: {
              _errors: [t("organizationSettings.errors.giphyApiKeyInvalid")],
            },
          })
        }
      }

      const apiKey = parsedInput.apiKey || existing?.config.apiKey
      if (!apiKey) {
        const t = await getTranslations()
        throw new Error(t("organizationSettings.errors.giphyApiKeyRequired"))
      }

      const config: GiphyCredential = { apiKey }

      await organizationCredentialService.upsert({
        organizationId: ctx.organization.id,
        type: "giphy",
        config,
      })
    },
  )
