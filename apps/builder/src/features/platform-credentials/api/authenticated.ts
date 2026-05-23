import { platformCredentialService } from "@chatbotx.io/business"
import { z } from "zod"
import { isCloud } from "@/env"
import { authorizedAPI } from "@/orpc"

export const platformCredentialsAuthenticatedAPI = {
  getGiphyApiKeyAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/platform-credentials/giphy/api-key",
      summary: "Get Giphy API key",
      tags: ["PlatformCredentials"],
    })
    .output(z.object({ apiKey: z.string().nullable() }))
    .handler(async ({ context }) => {
      const credential = await platformCredentialService.findDecrypted({
        userId: isCloud() ? context.user.id : undefined,
        type: "giphy",
      })

      return { apiKey: credential?.config.apiKey ?? null }
    }),
}
