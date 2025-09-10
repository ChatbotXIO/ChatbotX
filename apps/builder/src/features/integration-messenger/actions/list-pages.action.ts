"use server"

import ky from "ky"
import type { z } from "zod"
import { actionClient } from "@/lib/safe-action"
import {
  type facebookPageSchema,
  graphFacebookRequestParams,
  listPagesResponseSchema,
} from "../schemas"

export type FacebookPage = z.infer<typeof facebookPageSchema>

export const getListPagesAction = actionClient
  .bindArgsSchemas(graphFacebookRequestParams.items)
  .action(async ({ bindArgsParsedInputs: [version, accessToken] }) => {
    try {
      const url = `https://graph.facebook.com/${version}/me/accounts`

      const response = await ky.get(url, {
        searchParams: {
          access_token: accessToken,
          fields: "id,name,access_token",
          limit: 100,
        },
      })

      if (!response.ok) {
        throw new Error(
          `Facebook API error: ${response.status} ${response.statusText}`,
        )
      }

      const data = (await response.json()) as unknown
      const validatedData = listPagesResponseSchema.parse(data)

      return {
        success: true,
        data: validatedData.data,
        message: "Facebook pages fetched successfully",
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to fetch Facebook pages"

      throw new Error(errorMessage)
    }
  })
