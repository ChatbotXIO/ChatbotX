"use server"

import { templateService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { PUBLISHER_REF_FORMAT } from "../schema/shared"
import { templateActionClientAllowExpired } from "./template-action-client"

/** Read-only, so a trial-expired workspace keeps it; the service re-checks the publisher-side permission. */
export const getInstallerIssuesAction = templateActionClientAllowExpired
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(
    z.object({ publisherRef: z.string().regex(PUBLISHER_REF_FORMAT) }),
  )
  .action(
    async ({
      ctx: { templateActor },
      bindArgsParsedInputs: [workspaceId, templateId],
      parsedInput,
    }) =>
      await templateService.getInstallerIssues({
        workspaceId,
        templateId,
        publisherRef: parsedInput.publisherRef,
        actor: templateActor,
      }),
  )
