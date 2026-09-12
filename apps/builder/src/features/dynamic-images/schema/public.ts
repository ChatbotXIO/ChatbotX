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
  name: z.string().optional(),
})

export const listDynamicImagesPublicResponse = publicListResponse(
  publicDynamicImageResource,
)

export const createDynamicImagePublicRequest = createDynamicImageRequest

export const updateDynamicImagePublicRequest = updateDynamicImageRequest.extend(
  {
    id: zodBigintAsString(),
  },
)

export const setDynamicImageEnabledPublicRequest = z.object({
  id: zodBigintAsString(),
  enabled: z.boolean(),
})
