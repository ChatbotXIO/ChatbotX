"use server"

import { templateService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { saveTemplateRequest } from "../schema/mutation"
import { templateActionClient } from "./template-action-client"

export const saveTemplateAction = templateActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(saveTemplateRequest)
  .action(
    async ({
      ctx: { user, workspace },
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }) => {
      const template = await templateService.createOrUpdate({
        workspaceId,
        tenantId: workspace.tenantId,
        createdBy: user.id,
        name: parsedInput.name,
        description: parsedInput.description,
        imageUrl: parsedInput.imageUrl,
        publisherName: parsedInput.publisherName,
        youtubeVideoId: parsedInput.youtubeVideoId,
        testLink: parsedInput.testLink,
        selection: parsedInput.selection,
        defaultPermissions: parsedInput.defaultPermissions,
        createInstallFolder: parsedInput.createInstallFolder,
        defaultAutoUpdate: parsedInput.defaultAutoUpdate,
        existingTemplateId: parsedInput.templateId,
      })

      return { templateId: template.id }
    },
  )
