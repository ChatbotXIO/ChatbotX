import { z } from "zod"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listIntegrationSmtps } from "../queries"
import { listIntegrationSmtpsResponse } from "../schemas/resource"

const listIntegrationSmtpsRequest = z.object({
  workspaceId: z.string(),
})

export const integrationSmtpAuthenticatedAPI = {
  listIntegrationSmtps: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/integrations/smtp",
      summary: "List SMTP integrations",
      tags: ["Integrations"],
    })
    .input(listIntegrationSmtpsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listIntegrationSmtpsResponse)
    .handler(async ({ input }) => listIntegrationSmtps(input)),
}
