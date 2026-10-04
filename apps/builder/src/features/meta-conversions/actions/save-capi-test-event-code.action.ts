"use server"

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { metaCapiEventChannelSchema } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { workspaceActionClient } from "@/lib/safe-action"
import { saveCapiTestEventCodeFor } from "../lib/capi-operations"
import { integrationNotFoundErrorKey } from "../lib/find-capi-integration"
import { isNotFound } from "../lib/is-not-found"

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

      try {
        await saveCapiTestEventCodeFor({
          channel: parsedInput.channel,
          workspaceId,
          integrationId,
          testEventCode: parsedInput.testEventCode,
        })
      } catch (error) {
        if (isNotFound(error)) {
          throw new ChatbotXException(
            t(integrationNotFoundErrorKey[parsedInput.channel]),
          )
        }
        throw error
      }

      return { success: true, testEventCode: parsedInput.testEventCode }
    },
  )
