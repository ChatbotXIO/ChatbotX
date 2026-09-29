"use server"

import {
  CapiTestEventError,
  metaConversionsService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { metaCapiEventChannelSchema } from "@chatbotx.io/database/schema"
import { sendConversionEvent } from "@chatbotx.io/integration-meta-conversions"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { CAPI_TEST_MESSAGING_ID_MAX_LENGTH } from "@chatbotx.io/utils/meta-capi"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  findCapiIntegration,
  integrationNotFoundErrorKey,
} from "../lib/find-capi-integration"
import { capiDatasetProvisioner } from "../lib/provision-capi-dataset"
import { surfaceCapiError } from "../lib/surface-capi-error"

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

      const integration = await findCapiIntegration(parsedInput.channel, {
        id: integrationId,
        workspaceId,
      })
      if (!integration) {
        throw new ChatbotXException(
          t(integrationNotFoundErrorKey[parsedInput.channel]),
        )
      }

      try {
        await metaConversionsService.sendTestEvent({
          channel: parsedInput.channel,
          integration,
          messagingId: parsedInput.messagingId,
          provisionDataset: capiDatasetProvisioner(parsedInput.channel),
          send: sendConversionEvent,
        })
        return { success: true }
      } catch (error) {
        if (error instanceof CapiTestEventError) {
          throw new ChatbotXException(t(error.reason))
        }
        surfaceCapiError(error)
      }
    },
  )
