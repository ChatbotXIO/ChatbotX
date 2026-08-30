import { tagContract } from "@chatbotx.io/api-contract/tag"
import { tagService } from "@chatbotx.io/business"
import { implement, onError } from "@orpc/server"
import { workspaceTokenAuthMidddleware } from "@/middlewares/workspace-token-auth"
import type { BaseContext } from "@/orpc"
import { logAndMapKnownOrpcErrors } from "@/orpc"
import { listTags } from "../queries"

const os = implement(tagContract)
  .$context<BaseContext>()
  .use(onError(logAndMapKnownOrpcErrors))
  .use(workspaceTokenAuthMidddleware)

const listTagsWorkspaceTokenAPI = os.listTagsContract.handler(
  async ({ context, input }) =>
    await listTags({
      ...input,
      workspaceId: context.workspace.id,
      sort: [{ id: "createdAt", desc: true }],
    }),
)

const createTagWorkspaceTokenAPI = os.createTagContract.handler(
  async ({ context, input }) =>
    await tagService.create({
      workspaceId: context.workspace.id,
      data: input,
    }),
)

const getTagWorkspaceTokenAPI = os.getTagContract.handler(
  async ({ context, input }) =>
    await tagService.findByKeyOrFail({
      key: input.idOrName,
      workspaceId: context.workspace.id,
    }),
)

const updateTagWorkspaceTokenAPI = os.updateTagContract.handler(
  async ({ context, input }) => {
    const { id, ...data } = input
    return await tagService.update({
      workspaceId: context.workspace.id,
      id,
      data,
    })
  },
)

const deleteTagWorkspaceTokenAPI = os.deleteTagContract.handler(
  async ({ context, input }) =>
    await tagService.deleteMany({
      workspaceId: context.workspace.id,
      ids: [input.id],
    }),
)

export const tagWorkspaceTokenAPIs = {
  listTagsWorkspaceTokenAPI,
  createTagWorkspaceTokenAPI,
  getTagWorkspaceTokenAPI,
  updateTagWorkspaceTokenAPI,
  deleteTagWorkspaceTokenAPI,
}
