"use server"

import { db, eq } from "@aha.chat/database/client"
import { organizationModel } from "@aha.chat/database/schema"
import {
  type GiphySettingsSchema,
  giphySettingsSchema,
  type OrganizationModel,
} from "@aha.chat/database/types"
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
  .inputSchema(giphySettingsSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { organization: OrganizationModel }
      parsedInput: GiphySettingsSchema
    }) => {
      const isValid = await isValidGiphyApiKey(parsedInput.apiKey)
      if (!isValid) {
        return returnValidationErrors(giphySettingsSchema, {
          apiKey: {
            _errors: ["Invalid GIPHY API key"],
          },
        })
      }

      const organizationSettings = ctx.organization.settings
      organizationSettings.giphy = parsedInput

      await db
        .update(organizationModel)
        .set({
          settings: organizationSettings,
        })
        .where(eq(organizationModel.id, ctx.organization.id))
    },
  )
