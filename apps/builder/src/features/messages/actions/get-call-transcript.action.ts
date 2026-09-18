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
 * Loads the diarized (VoIP/Meta-native) or flat, timestamped (browserWhisper)
 * transcript for the Call Information sheet, mapping
 * speaker labels to display names: `"Business"` → the agent who placed
 * (outbound) or answered (inbound) the call, `"Customer"` → the contact.
 * `hasSpeakers=false` (no `speaker` field on any segment, i.e. browserWhisper)
 * tells the sheet to omit the name column entirely. Empty `segments` is a
 * valid "unavailable" result, not an error. A read action — allowed even
 * for an expired/owner-blocked workspace (AGENTS.md invariant #14).
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
