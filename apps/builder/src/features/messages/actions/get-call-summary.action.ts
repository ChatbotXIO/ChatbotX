"use server"

import { whatsappCallSummaryService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { assertCanReadCallArtifactOrThrow } from "@/features/integration-whatsapp/calling/actions/assert-call-access"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

const getCallSummarySchema = z.object({
  whatsappCallId: zodBigintAsString(),
})

/**
 * The AI Summary tab's read for the Call Information sheet — split from
 * `getCallTranscriptAction` so the two tabs don't block each other's fetch.
 * `undefined` means no summary generated yet, not an error (renders the
 * "Generate summary" prompt). Read-only, so allowed on an expired/blocked
 * workspace (AGENTS.md invariant #14).
 */
export const getCallSummaryAction = workspaceActionClientAllowExpired
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(getCallSummarySchema)
  .action(async ({ bindArgsParsedInputs: [workspaceId], ctx, parsedInput }) => {
    await assertCanReadCallArtifactOrThrow({
      workspaceId,
      whatsappCallId: parsedInput.whatsappCallId,
      member: {
        userId: ctx.user.id,
        permissions: ctx.workspaceMemberPermissions,
      },
    })
    return {
      result: await whatsappCallSummaryService.getSummaryForCall({
        callId: parsedInput.whatsappCallId,
        workspaceId,
      }),
    }
  })
