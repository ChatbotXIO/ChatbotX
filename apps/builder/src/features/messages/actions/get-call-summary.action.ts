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
 * The AI Summary tab's read for the Call Information sheet — a companion
 * read to `getCallTranscriptAction`, split out
 * separately so the transcript tab never has to wait on the summary
 * fetch (and vice versa). Returns `undefined` when no summary has been
 * generated yet — a valid state, not an error; the sheet renders the
 * "Generate summary" prompt for it. A read action — allowed even for an
 * expired/owner-blocked workspace (AGENTS.md invariant #14).
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
