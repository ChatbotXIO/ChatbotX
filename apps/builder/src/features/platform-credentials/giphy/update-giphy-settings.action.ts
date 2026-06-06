"use server"

import { platformCredentialService } from "@chatbotx.io/business"
import {
  type GiphyCredential,
  giphyCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import ky from "ky"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"

import { logger } from "@/lib/log"
import { authActionClient } from "@/lib/safe-action"
import { credentialScopeSchema, resolveCredentialScopedUserId } from "../scope"

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

export const updateGiphySettingsAction = authActionClient
  .bindArgsSchemas([credentialScopeSchema])
  .inputSchema(giphyCredentialUpdateSchema)
  .action(async ({ ctx, bindArgsParsedInputs: [scope], parsedInput }) => {
    const scopedUserId = resolveCredentialScopedUserId(ctx.user, scope)
    const existing = await platformCredentialService.findDecrypted({
      userId: scopedUserId,
      type: "giphy",
    })

    if (parsedInput.apiKey) {
      const isValid = await isValidGiphyApiKey(parsedInput.apiKey)
      if (!isValid) {
        const t = await getTranslations()
        return returnValidationErrors(giphyCredentialUpdateSchema, {
          apiKey: {
            _errors: [t("platformSettings.errors.giphyApiKeyInvalid")],
          },
        })
      }
    }

    const apiKey = parsedInput.apiKey || existing?.config.apiKey
    if (!apiKey) {
      const t = await getTranslations()
      throw new Error(t("platformSettings.errors.giphyApiKeyRequired"))
    }

    const config: GiphyCredential = { apiKey }

    await platformCredentialService.upsert({
      userId: scopedUserId,
      type: "giphy",
      config,
    })
  })
