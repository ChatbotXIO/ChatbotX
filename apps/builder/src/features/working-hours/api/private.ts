import { workingHoursService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"

const listWorkingHoursOptionsRequest = z.object({
  workspaceId: zodBigintAsString(),
})

const listWorkingHoursOptionsResponse = z.object({
  data: z.array(z.object({ id: z.string(), name: z.string() })),
})

/** Builder-only reads; the public surface is `features/working-hours/api/public.ts`. */
export const workingHoursAPI = {
  listWorkingHoursOptionsWorkspaceAuthAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/working-hours/options",
      summary: "List working-hours schedule options",
      tags: ["Working Hours"],
    })
    .input(listWorkingHoursOptionsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listWorkingHoursOptionsResponse)
    .handler(async ({ input }) => {
      const schedules = await workingHoursService.listByWorkspace({
        workspaceId: input.workspaceId,
      })
      return {
        data: schedules.map(({ id, name }) => ({ id, name })),
      }
    }),
}
