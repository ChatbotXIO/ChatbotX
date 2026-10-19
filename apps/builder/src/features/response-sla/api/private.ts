import { responseSlaService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"

/** Builder-only: lets the inbox hide SLA filters while the SLA is off. The public surface is `api/public.ts`. */
export const responseSlaAPI = {
  getResponseSlaStatusWorkspaceAuthAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/response-sla/status",
      summary: "Whether the response SLA is switched on",
      tags: ["Response SLA"],
    })
    .input(z.object({ workspaceId: zodBigintAsString() }))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.object({ enabled: z.boolean() }))
    .handler(async ({ input }) => ({
      enabled:
        (
          await responseSlaService.findPolicy({
            workspaceId: input.workspaceId,
          })
        )?.enabled ?? false,
    })),
}
