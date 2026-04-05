"use server"

import { db } from "@chatbotx.io/database/client"
import { flowModel, flowVersionModel } from "@chatbotx.io/database/schema"
import { sendMessageNodeDefaultFn } from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import {
  type ChatbotIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { ensureFolderIsExists } from "@/features/folders/actions/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import { type CreateFlowSchema, createFlowSchema } from "../schemas/action"

export const createFlowAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createFlowSchema)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateFlowSchema
    }) => {
      if (parsedInput.folderId) {
        await ensureFolderIsExists(parsedInput.folderId, workspaceId, "flow")
      }

      const defaultNode = sendMessageNodeDefaultFn({
        dataProps: {
          name: "Send Message #1",
          isStartNode: true,
        },
      })

      await db.transaction(async (tx) => {
        const flowId = createId()
        await tx.insert(flowModel).values({
          ...parsedInput,
          id: flowId,
          workspaceId,
        })

        await tx.insert(flowVersionModel).values({
          id: createId(),
          workspaceId,
          flowId,
          // biome-ignore lint/suspicious/noExplicitAny: temporary any to bypass circular dependency between flow and flow version
          nodes: [defaultNode as any],
          edges: [],
          isDraft: true,
          startNodeId: defaultNode.id,
        })
      })

      revalidateCacheTags(`workspaces:${workspaceId}#flows`)
    },
  )
