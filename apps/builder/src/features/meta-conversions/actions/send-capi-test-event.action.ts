"use server"

import {
  CapiTestEventError,
  metaConversionsService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { metaCapiEventChannelSchema } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  findCapiIntegration,
  integrationNotFoundErrorKey,
} from "../lib/find-capi-integration"
import { surfaceCapiError } from "../lib/surface-capi-error"

const inputSchema = z.object({ channel: metaCapiEventChannelSchema })

type Input = z.infer<typeof inputSchema>

/**
 * Queues one sample event through the real CAPI pipeline so the user can see
 * the full payload under Events Manager → Test events. Requires a saved
 * test_event_code (enforced by the business layer and again by the worker).
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
        const event = await metaConversionsService.enqueueTestEvent({
          channel: parsedInput.channel,
          integration,
        })
        return { success: true, queued: event !== null }
      } catch (error) {
        if (error instanceof CapiTestEventError) {
          throw new ChatbotXException(t(error.reason))
        }
        surfaceCapiError(error)
      }
    },
  )
