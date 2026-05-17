"use server"

import { organizationCredentialService } from "@chatbotx.io/business"
import {
  type GiphyCredential,
  type GiphyCredentialUpdate,
  giphyCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import type { OrganizationModel } from "@chatbotx.io/database/types"
import ky from "ky"
import { returnValidationErrors } from "next-safe-action"

import { logger } from "@/lib/log"
import { organizationActionClient } from "@/lib/safe-action"

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

export const updateGiphySettingsAction = organizationActionClient
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
          return returnValidationErrors(giphyCredentialUpdateSchema, {
            apiKey: {
              _errors: ["Invalid GIPHY API key"],
            },
          })
        }
      }

      const apiKey = parsedInput.apiKey || existing?.config.apiKey
      if (!apiKey) {
        throw new Error("API Key is required to configure GIPHY.")
      }

      const config: GiphyCredential = { apiKey }

      await organizationCredentialService.upsert({
        organizationId: ctx.organization.id,
        type: "giphy",
        config,
      })
    },
  )
