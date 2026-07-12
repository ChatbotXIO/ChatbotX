import { reflinkService } from "@chatbotx.io/business"
import z from "zod"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { findReflink } from "../queries"
import { getReflinkRequest } from "../schemas/query"
import { reflinkResponse } from "../schemas/resource"

const listReflinkOptionsRequest = z.object({
  workspaceId: z.string(),
})

const listReflinkOptionsResponse = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    }),
  ),
})

export const refLinkAuthenticatedAPI = {
  listRefLinkOptionsAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/ref-links/options",
      summary: "List ref link options",
      tags: ["Ref Links"],
    })
    .input(listReflinkOptionsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listReflinkOptionsResponse)
    .handler(async ({ input }) => ({
      data: await reflinkService.listOptions(input),
    })),

  getRefLinksAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/ref-links/{id}",
      summary: "Get a specific ref link",
      tags: ["Ref Links"],
    })
    .input(getReflinkRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(reflinkResponse)
    .handler(
      async ({ input }) =>
        await findReflink({
          workspaceId: input.workspaceId,
          id: input.id,
        }),
    ),
}
