"use server"

import { CapiTestEventError } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { metaCapiEventChannelSchema } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { CAPI_TEST_MESSAGING_ID_MAX_LENGTH } from "@chatbotx.io/utils/meta-capi"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { workspaceActionClient } from "@/lib/safe-action"
import { sendCapiTestEventFor } from "../lib/capi-operations"
import { integrationNotFoundErrorKey } from "../lib/find-capi-integration"
import { isNotFound } from "../lib/is-not-found"

const inputSchema = z.object({
  channel: metaCapiEventChannelSchema,
  // Format is enforced by the business layer (`capiTestMessagingIdSchema`),
  // which surfaces a translated reason; only bound the size here.
  messagingId: z.string().trim().min(1).max(CAPI_TEST_MESSAGING_ID_MAX_LENGTH),
})

type Input = z.infer<typeof inputSchema>

/**
 * Posts one sample Purchase straight to Meta, identified only by the
 * messaging id the admin typed in (never a stored contact), so the full
 * payload — and any Meta rejection — shows up immediately under Events
 * Manager → Test events. Requires a saved test_event_code (enforced by the
 * business layer).
 */
export const sendCapiTestEventAction = workspaceActionClient
  .inputSchema(inputSchema)
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId, integrationId],
    }: {
      parsedInput: Input
      bindArgsParsedInputs: readonly [string, string]
    }) => {
      const t = await getTranslations("metaConversions.errors")
      await assertWorkspaceSuperAdmin(workspaceId)

      try {
        await sendCapiTestEventFor({
          channel: parsedInput.channel,
          workspaceId,
          integrationId,
          messagingId: parsedInput.messagingId,
        })
        return { success: true }
      } catch (error) {
        if (error instanceof CapiTestEventError) {
          throw new ChatbotXException(t(error.reason))
        }
        if (isNotFound(error)) {
          throw new ChatbotXException(
            t(integrationNotFoundErrorKey[parsedInput.channel]),
          )
        }
        throw error
      }
    },
  )
