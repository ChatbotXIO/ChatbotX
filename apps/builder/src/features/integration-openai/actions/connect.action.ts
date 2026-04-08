"use server"

import { openaiModels } from "@chatbotx.io/ai"
import { db, eq } from "@chatbotx.io/database/client"
import {
  integrationModel,
  integrationOpenaiModel,
} from "@chatbotx.io/database/schema"
import { AuthType, type SecretTextAuthValue } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import {
  type ChatbotIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { authActionClient } from "@/lib/safe-action"
import {
  type ConnectOpenAISchema,
  connectOpenAISchema,
} from "../schemas/request"

export const connectOpenAIAction = authActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(connectOpenAISchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    }: {
      parsedInput: ConnectOpenAISchema
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      const integrationOpenAI = await db.query.integrationOpenaiModel.findFirst(
        {
          where: {
            workspaceId,
          },
        },
      )

      await db.transaction(async (tx) => {
        if (integrationOpenAI) {
          await tx
            .update(integrationOpenaiModel)
            .set({
              model: openaiModels.enum["gpt-4o-mini"],
              auth: {
                authType: AuthType.secretText,
                secretText: parsedInput.apiKey,
              } as SecretTextAuthValue,
              temperature: parsedInput.temperature,
              maxOutputTokens: parsedInput.maxOutputTokens,
            })
            .where(eq(integrationOpenaiModel.id, integrationOpenAI.id))
        } else {
          const integration = await tx
            .insert(integrationModel)
            .values({
              id: createId(),
              workspaceId,
              integrationType: "openai",
            })
            .returning()
            .then((result) => result[0])

          await tx.insert(integrationOpenaiModel).values({
            id: createId(),
            integrationId: integration.id,
            workspaceId,
            model: openaiModels.enum["gpt-4o-mini"],
            auth: {
              authType: AuthType.secretText,
              secretText: parsedInput.apiKey,
            } as SecretTextAuthValue,
            temperature: parsedInput.temperature,
            maxOutputTokens: parsedInput.maxOutputTokens,
          })
        }
      })

      return
    },
  )
