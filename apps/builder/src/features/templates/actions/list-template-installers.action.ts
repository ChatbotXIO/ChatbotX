"use server"

import { templateService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { templateActionClientAllowExpired } from "./template-action-client"

const listInstallersInput = z.object({
  search: z.string().trim().max(100).optional(),
  cursor: z.string().max(512).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

/** Read-only, so a trial-expired workspace keeps it; the service re-checks the publisher-side permission. */
export const listTemplateInstallersAction = templateActionClientAllowExpired
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(listInstallersInput)
  .action(
    async ({
      ctx: { templateActor },
      bindArgsParsedInputs: [workspaceId, templateId],
      parsedInput,
    }) => {
      const [template, installers, analytics] = await Promise.all([
        templateService.getDetailOrFail({ workspaceId, templateId }),
        templateService.listPublisherInstallations({
          workspaceId,
          templateId,
          actor: templateActor,
          search: parsedInput.search || undefined,
          cursor: parsedInput.cursor,
          limit: parsedInput.limit,
        }),
        // Template-wide: read with the first page, never again per page.
        parsedInput.cursor
          ? null
          : templateService.getInstallAnalytics({
              workspaceId,
              templateId,
              actor: templateActor,
            }),
      ])
      return {
        templateVersion: template.version,
        installers,
        byVersion: analytics?.byVersion ?? null,
      }
    },
  )
