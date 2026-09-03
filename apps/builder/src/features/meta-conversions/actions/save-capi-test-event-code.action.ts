"use server"

import { metaConversionsService } from "@chatbotx.io/business"
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

const inputSchema = z.object({
  channel: metaCapiEventChannelSchema,
  // Empty string from a cleared input means "remove the code".
  testEventCode: z
    .string()
    .trim()
    .max(64)
    .regex(/^[A-Za-z0-9_-]*$/)
    .transform((value) => (value.length > 0 ? value : null)),
})

type Input = z.infer<typeof inputSchema>

/** Set or clear the Events Manager test_event_code for one channel integration. */
export const saveCapiTestEventCodeAction = workspaceActionClient
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

      await metaConversionsService.saveCapiTestEventCode({
        channel: parsedInput.channel,
        integration,
        testEventCode: parsedInput.testEventCode,
      })

      return { success: true, testEventCode: parsedInput.testEventCode }
    },
  )
