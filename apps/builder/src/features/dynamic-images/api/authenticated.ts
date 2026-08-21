import { notFoundException } from "@chatbotx.io/business/errors"
import { z } from "zod"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { findDynamicImage } from "../queries"
import { dynamicImageResource } from "../schemas/resource"

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
    .handler(async ({ input }) => {
      const dynamicImage = await findDynamicImage(input)
      if (!dynamicImage) {
        throw notFoundException("Dynamic image not found")
      }
      return dynamicImage
    }),
}
