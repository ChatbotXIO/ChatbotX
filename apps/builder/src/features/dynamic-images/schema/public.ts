import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import { createDynamicImageRequest, updateDynamicImageRequest } from "./action"
import { dynamicImageResource } from "./resource"

export const publicDynamicImageResource = dynamicImageResource
  .omit({ workspaceId: true, backgroundUrl: true })
  .extend({
    backgroundUrl: z
      .string()
      .nullable()
      .describe("Public URL of the rendered static background."),
    imageUrl: z
      .string()
      .describe(
        "Trigger URL to embed. Replace `{{user_id}}` with the contact's channel-side id to get a personalized render; without it the static background is served.",
      ),
  })

export const listDynamicImagesPublicRequest = publicListRequest.extend({
  name: z
    .string()
    .optional()
    .describe(
      "Case-insensitive substring match against the dynamic image's name.",
    ),
})

export const listDynamicImagesPublicResponse = publicListResponse(
  publicDynamicImageResource,
)

export const createDynamicImagePublicRequest = createDynamicImageRequest

export const updateDynamicImagePublicRequest = updateDynamicImageRequest.extend(
  {
    id: zodBigintAsString().describe(
      "Dynamic image id. Get it from `dynamicImages.list`.",
    ),
  },
)

export const setDynamicImageEnabledPublicRequest = z.object({
  id: zodBigintAsString().describe(
    "Dynamic image id. Get it from `dynamicImages.list`.",
  ),
  enabled: z.boolean().describe("Whether the dynamic image should be enabled."),
})
