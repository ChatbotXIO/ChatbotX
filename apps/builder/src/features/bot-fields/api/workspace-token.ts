import { botFieldContract } from "@chatbotx.io/api-contract/bot-field"
import { botFieldService } from "@chatbotx.io/business"
import { implement, onError } from "@orpc/server"
import { maxPerPage } from "@/lib/shared-request"
import { workspaceTokenAuthMidddleware } from "@/middlewares/workspace-token-auth"
import type { BaseContext } from "@/orpc"
import { logAndMapKnownOrpcErrors } from "@/orpc"

const os = implement(botFieldContract)
  .$context<BaseContext>()
  .use(onError(logAndMapKnownOrpcErrors))
  .use(workspaceTokenAuthMidddleware)

const botFieldWorkspaceTokenAPIs = {
  listBotFieldsWorkspaceTokenAPI: os.listBotFieldsContract.handler(
    async ({ context }) => {
      const result = await botFieldService.list({
        workspaceId: context.workspace.id,
        page: 1,
        perPage: maxPerPage,
        sort: [{ id: "createdAt", desc: true }],
        name: null,
        folderId: null,
      })
      return { data: result.data }
    },
  ),

  createBotFieldWorkspaceTokenAPI: os.createBotFieldContract.handler(
    async ({ context, input }) =>
      await botFieldService.create({
        workspaceId: context.workspace.id,
        data: input,
      }),
  ),

  getBotFieldWorkspaceTokenAPI: os.getBotFieldContract.handler(
    async ({ context, input }) =>
      await botFieldService.findByKeyOrFail({
        key: input.idOrName,
        workspaceId: context.workspace.id,
      }),
  ),

  setBotFieldWorkspaceTokenAPI: os.setBotFieldContract.handler(
    async ({ context, input }) => {
      const { idOrName, ...rest } = input
      return await botFieldService.updateByKey({
        workspaceId: context.workspace.id,
        key: idOrName,
        data: rest,
      })
    },
  ),

  setBotFieldsWorkspaceTokenAPI: os.setBotFieldsContract.handler(
    async ({ context, input }) => {
      await Promise.all(
        input.fields.map(({ key, value }) =>
          botFieldService.updateByKey({
            workspaceId: context.workspace.id,
            key,
            data: { value },
          }),
        ),
      )
    },
  ),

  bulkUpdateBotFieldsWorkspaceTokenAPI: os.bulkUpdateBotFieldsContract.handler(
    async ({ context, input }) => {
      await botFieldService.bulkUpdateByKeys({
        workspaceId: context.workspace.id,
        updates: input.fields.map((field) => ({
          key: "id" in field ? String(field.id) : field.name,
          value: field.value,
        })),
      })
    },
  ),

  deleteBotFieldsWorkspaceTokenAPI: os.deleteBotFieldContract.handler(
    async ({ context, input }) =>
      await botFieldService.deleteByKey({
        workspaceId: context.workspace.id,
        key: input.idOrName,
      }),
  ),
}

export default botFieldWorkspaceTokenAPIs
