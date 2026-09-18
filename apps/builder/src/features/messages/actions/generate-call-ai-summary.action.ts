"use server"

import { aiProviders } from "@chatbotx.io/ai"
import { generateCallSummary } from "@chatbotx.io/ai/server"
import {
  whatsappCallSummaryService,
  whatsappCallTranscriptService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { assertCanReadCallArtifactOrThrow } from "@/features/integration-whatsapp/calling/actions/assert-call-access"
import { workspaceActionClient } from "@/lib/safe-action"

const generateCallAiSummarySchema = z.object({
  whatsappCallId: zodBigintAsString(),
  provider: aiProviders,
})

/**
 * Loads the transcript, generates a summary via the chosen AI provider, and
 * persists it (`attachSummary` decides first-write vs. Regenerate-overwrite
 * from the row's current state), enriching the finalize activity message so
 * any open card/sheet flips `hasSummary` in realtime. Throws on an empty
 * transcript — the UI disables the trigger, but the server re-validates.
 */
export const generateCallAiSummaryAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(generateCallAiSummarySchema)
  .action(async ({ bindArgsParsedInputs: [workspaceId], ctx, parsedInput }) => {
    const { whatsappCallId, provider } = parsedInput

    await assertCanReadCallArtifactOrThrow({
      workspaceId,
      whatsappCallId,
      member: {
        userId: ctx.user.id,
        permissions: ctx.workspaceMemberPermissions,
      },
    })

    const transcriptText =
      await whatsappCallTranscriptService.getTranscriptTextForCall({
        callId: whatsappCallId,
        workspaceId,
      })
    if (!transcriptText.trim()) {
      throw new ChatbotXException("This call has no transcript to summarize")
    }

    const aiSummary = await generateCallSummary({
      workspaceId,
      provider,
      transcriptText,
    })

    await whatsappCallSummaryService.attachSummary({
      callId: whatsappCallId,
      workspaceId,
      aiSummary,
      provider,
    })

    return { aiSummary }
  })
