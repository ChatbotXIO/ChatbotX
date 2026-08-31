import { notFoundException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { workspaceTokenAuthAPI } from "@/orpc"
import { findReflink } from "../queries"
import { reflinkResource } from "../schema/resource"

export const refLinksWorkspaceTokenAPIs = {
  getRefLinkWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ref-links/{id}",
      summary: "Get a specific ref link",
      tags: ["Ref Links"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .output(reflinkResource)
    .handler(async ({ context, input }) => {
      const reflink = await findReflink({
        workspaceId: context.workspace.id,
        id: input.id,
      })
      if (!reflink) {
        throw notFoundException("Ref link not found")
      }
      return reflink
    }),
}

export default refLinksWorkspaceTokenAPIs
