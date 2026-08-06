import { coexistService } from "@chatbotx.io/business"
import { z } from "zod"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"

const setCoexistMessengerRequest = z.object({
  workspaceId: z.string(),
  integrationId: z.string(),
  enabled: z.boolean(),
})
export type SetCoexistMessengerRequest = z.infer<
  typeof setCoexistMessengerRequest
>

const setCoexistMessengerResponse = z.discriminatedUnion("success", [
  z.object({ success: z.literal(true) }),
  z.object({
    success: z.literal(false),
    reason: z.string().optional(),
    msg: z.string().optional(),
  }),
])
export type SetCoexistMessengerResponse = z.infer<
  typeof setCoexistMessengerResponse
>

export const integrationMessengerCoexistAPIs = {
  setCoexistMessengerAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/integrations/messenger/{integrationId}/coexist",
      summary: "Enable or disable Messenger coexist sync",
      tags: ["Integrations"],
    })
    .input(setCoexistMessengerRequest)
    .output(setCoexistMessengerResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      const { workspaceId, integrationId, enabled } = input
      return await (enabled
        ? coexistService.enable({
            workspaceId,
            integrationId,
            channel: "messenger",
          })
        : coexistService.disable({
            workspaceId,
            integrationId,
            channel: "messenger",
          }))
    }),
}
