import { keywordContract } from "@chatbotx.io/api-contract/keyword"
import { automatedResponseService } from "@chatbotx.io/business"
import { implement, onError } from "@orpc/server"
import { maxPerPage } from "@/lib/shared-request"
import { workspaceTokenAuthMidddleware } from "@/middlewares/workspace-token-auth"
import type { BaseContext } from "@/orpc"
import { logAndMapKnownOrpcErrors } from "@/orpc"

const os = implement(keywordContract)
  .$context<BaseContext>()
  .use(onError(logAndMapKnownOrpcErrors))
  .use(workspaceTokenAuthMidddleware)

const listKeywordsWorkspaceTokenAPI = os.listKeywordsContract.handler(
  async ({ context }) => {
    const { data } = await automatedResponseService.list({
      workspaceId: context.workspace.id,
      type: "inbound",
      page: 1,
      perPage: maxPerPage,
      sort: [{ id: "createdAt", desc: true }],
      keyword: null,
      folderId: null,
    })

    return { data }
  },
)

export const keywordsWorkspaceTokenAPIs = {
  listKeywordsWorkspaceTokenAPI,
}

export default keywordsWorkspaceTokenAPIs
