"use server"

import { whatsappCallTranscriptService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { assertCanReadCallArtifactOrThrow } from "@/features/integration-whatsapp/calling/actions/assert-call-access"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

const getCallTranscriptSchema = z.object({
  whatsappCallId: zodBigintAsString(),
})

/**
 * Maps `"Business"`/`"Customer"` speaker labels to display names.
 * `hasSpeakers=false` (browserWhisper, no `speaker` field) tells the sheet
 * to omit the name column. Empty `segments` is a valid "unavailable"
 * result, not an error. Read action, allowed even for an
 * expired/owner-blocked workspace (AGENTS.md invariant #14).
 */
export const getCallTranscriptAction = workspaceActionClientAllowExpired
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(getCallTranscriptSchema)
  .action(async ({ bindArgsParsedInputs: [workspaceId], ctx, parsedInput }) => {
    await assertCanReadCallArtifactOrThrow({
      workspaceId,
      whatsappCallId: parsedInput.whatsappCallId,
      member: {
        userId: ctx.user.id,
        permissions: ctx.workspaceMemberPermissions,
      },
    })
    return await whatsappCallTranscriptService.getTranscriptForCall({
      callId: parsedInput.whatsappCallId,
      workspaceId,
    })
  })
