import { coexistService } from "@chatbotx.io/business"
import { z } from "zod"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"

const setCoexistInstagramRequest = z.object({
  workspaceId: z.string(),
  integrationId: z.string(),
  enabled: z.boolean(),
})
export type SetCoexistInstagramRequest = z.infer<
  typeof setCoexistInstagramRequest
>

const setCoexistInstagramResponse = z.discriminatedUnion("success", [
  z.object({ success: z.literal(true), runId: z.string().optional() }),
  z.object({
    success: z.literal(false),
    reason: z.string().optional(),
    msg: z.string().optional(),
  }),
])
export type SetCoexistInstagramResponse = z.infer<
  typeof setCoexistInstagramResponse
>

export const integrationInstagramCoexistAPIs = {
  setCoexistInstagramAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/integrations/instagram/{integrationId}/coexist",
      summary: "Enable or disable native Instagram coexist sync",
      tags: ["Integrations"],
    })
    .input(setCoexistInstagramRequest)
    .output(setCoexistInstagramResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) =>
      input.enabled
        ? coexistService.enable({
            workspaceId: input.workspaceId,
            integrationId: input.integrationId,
            channel: "instagram",
          })
        : coexistService.disable({
            workspaceId: input.workspaceId,
            integrationId: input.integrationId,
            channel: "instagram",
          }),
    ),
}
