"use server"

import { callRecordingService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { assertCanReadCallArtifactOrThrow } from "@/features/integration-whatsapp/calling/actions/assert-call-access"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

const getCallRecordingUrlSchema = z.object({
  whatsappCallId: zodBigintAsString(),
})

/**
 * Mints a fresh 15-minute signed playback URL for a WhatsApp call recording (browserWhisper
 * or Meta-native VoIP — both attach to the same WhatsappCall row), called on-demand to avoid
 * a 403 on a long-open tab. A read action, allowed even for an expired/owner-blocked workspace.
 * getRecordingUrlForCall re-derives the path from the call row and throws on a cross-workspace
 * request rather than returning null.
 */
export const getCallRecordingUrlAction = workspaceActionClientAllowExpired
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(getCallRecordingUrlSchema)
  .action(async ({ bindArgsParsedInputs: [workspaceId], ctx, parsedInput }) => {
    await assertCanReadCallArtifactOrThrow({
      workspaceId,
      whatsappCallId: parsedInput.whatsappCallId,
      member: {
        userId: ctx.user.id,
        permissions: ctx.workspaceMemberPermissions,
      },
    })
    const url = await callRecordingService.getRecordingUrlForCall({
      callId: parsedInput.whatsappCallId,
      workspaceId,
    })
    return { url }
  })
