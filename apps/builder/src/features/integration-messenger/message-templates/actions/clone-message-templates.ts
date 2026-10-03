"use server"

import {
  messengerIntegrationService,
  messengerMessageTemplateService,
} from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { workspaceActionClient } from "@/lib/safe-action"
import { cloneMessengerMessageTemplate } from "../lib/message-template-operations"

export const cloneMessengerMessageTemplateAction = workspaceActionClient
  .bindArgsSchemas([
    zodBigintAsString(),
    zodBigintAsString(),
    zodBigintAsString(),
  ])
  .schema(
    z.object({
      targetIntegrationMessengerIds: z.array(zodBigintAsString()).min(1),
    }),
  )
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [
        workspaceId,
        sourceIntegrationMessengerId,
        templateId,
      ],
      parsedInput: { targetIntegrationMessengerIds },
      ctx: { user },
    } = props

    // Load source template, verifying it belongs to the source integration + workspace
    const sourceTemplate =
      await messengerMessageTemplateService.findByIdForIntegration({
        id: templateId,
        integrationMessengerId: sourceIntegrationMessengerId,
        workspaceId,
      })

    if (!sourceTemplate) {
      throw new Error("Source template not found")
    }

    // Source integration (for its pageId — never clone a template onto its own page).
    const sourceIntegration =
      await messengerIntegrationService.findByIdForWorkspace({
        id: sourceIntegrationMessengerId,
        workspaceId,
      })

    // Authorize per target: the user must be an admin (owner or superAdmin)
    // of the target's workspace, and the target must not be the source's own
    // Facebook Page. Memberships are read uncached so a just-revoked admin
    // cannot clone across a workspace boundary.
    const requested = new Set(targetIntegrationMessengerIds)
    const cloneTargets =
      await messengerIntegrationService.listCloneTargetsForUser({
        userId: user.id,
        excludePageId: sourceIntegration?.pageId,
        authoritative: true,
      })
    const targets = cloneTargets.filter((target) => requested.has(target.id))

    if (targets.length === 0) {
      throw new Error("No authorized target channels found")
    }

    return await cloneMessengerMessageTemplate({
      sourceWorkspaceId: workspaceId,
      sourceTemplate,
      targets,
    })
  })
