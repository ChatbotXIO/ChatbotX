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
 * On-demand AI Summary for a WhatsApp call: loads the
 * transcript, calls the caller-chosen connected AI provider, persists the
 * result (first write or unconditional "Regenerate" overwrite — decided
 * inside `attachSummary` from the row's current state), and enriches the
 * finalize activity message so any open card/sheet flips `hasSummary` in
 * realtime. Throws when the transcript is empty rather than generating a
 * summary from nothing — the UI disables the trigger for this case, but the
 * server re-validates rather than trusting the client-side check.
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
