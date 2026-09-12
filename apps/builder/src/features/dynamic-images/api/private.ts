import { dynamicImageService } from "@chatbotx.io/business/dynamic-image"
import { z } from "zod"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { dynamicImageResource } from "../schema/resource"

export const dynamicImagesAuthenticatedAPI = {
  getDynamicImageAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/dynamic-images/{id}",
      summary: "Get a dynamic image",
      tags: ["Dynamic Images"],
    })
    .input(z.object({ workspaceId: z.string(), id: z.string() }))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(dynamicImageResource)
    .handler(async ({ input }) => await dynamicImageService.find(input)),
}
