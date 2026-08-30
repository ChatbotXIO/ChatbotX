import { customFieldContract } from "@chatbotx.io/api-contract/custom-field"
import { customFieldService } from "@chatbotx.io/business"
import { implement, onError } from "@orpc/server"
import { maxPerPage } from "@/lib/shared-request"
import type { BaseContext } from "@/middlewares/context"
import { workspaceTokenAuthMidddleware } from "@/middlewares/workspace-token-auth"
import { mapKnownOrpcErrors, requireTokenScope } from "@/orpc"

const os = implement(customFieldContract)
  .$context<BaseContext>()
  .use(onError(mapKnownOrpcErrors))
  .use(workspaceTokenAuthMidddleware)
  .use(requireTokenScope("contacts"))

const customFieldsWorkspaceTokenAPI = {
  listCustomFieldsWorkspaceTokenAPI: os.listCustomFieldsContract.handler(
    async ({ context }) => {
      const result = await customFieldService.list({
        workspaceId: context.workspace.id,
        perPage: maxPerPage,
      })
      return { data: result.data }
    },
  ),

  createCustomFieldWorkspaceTokenAPI: os.createCustomFieldContract.handler(
    async ({ context, input }) =>
      await customFieldService.create({
        workspaceId: context.workspace.id,
        data: input,
      }),
  ),

  getCustomFieldWorkspaceTokenAPI: os.getCustomFieldContract.handler(
    async ({ context, input }) => {
      const customField = await customFieldService.findByKey({
        key: input.idOrName,
        workspaceId: context.workspace.id,
      })
      if (!customField) {
        throw new Error("Custom field not found")
      }
      return customField
    },
  ),

  updateCustomFieldWorkspaceTokenAPI: os.updateCustomFieldContract.handler(
    async ({ context, input }) => {
      const { id, ...rest } = input
      return await customFieldService.update(
        { workspaceId: context.workspace.id, id },
        rest,
      )
    },
  ),

  deleteCustomFieldWorkspaceTokenAPI: os.deleteCustomFieldContract.handler(
    async ({ context, input }) =>
      await customFieldService.delete({
        workspaceId: context.workspace.id,
        ids: [input.id],
      }),
  ),
}

export default customFieldsWorkspaceTokenAPI
