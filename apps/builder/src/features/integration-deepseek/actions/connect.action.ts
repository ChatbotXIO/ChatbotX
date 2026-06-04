"use server"

import { aiProviders } from "@chatbotx.io/ai"
import { aiIntegrationService } from "@chatbotx.io/ai/server"
import { db, eq } from "@chatbotx.io/database/client"
import {
  integrationDeepseekModel,
  integrationModel,
} from "@chatbotx.io/database/schema"
import { AuthType, type SecretTextAuthValue } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { verifyDeepSeekApiKey } from "../lib"
import {
  type ConnectDeepSeekSchema,
  connectDeepSeekSchema,
} from "../schemas/request"

export const connectDeepSeekAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(connectDeepSeekSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    }: {
      parsedInput: ConnectDeepSeekSchema
      bindArgsParsedInputs: WorkspaceIdRequestParams
    }) => {
      const t = await getTranslations()

      if (!(await verifyDeepSeekApiKey(parsedInput.apiKey))) {
        return returnValidationErrors(connectDeepSeekSchema, {
          apiKey: {
            _errors: [t("validation.invalidApiKey")],
          },
        })
      }

      const integrationDeepseek =
        await db.query.integrationDeepseekModel.findFirst({
          where: { workspaceId },
        })

      await db.transaction(async (tx) => {
        if (integrationDeepseek) {
          await tx
            .update(integrationDeepseekModel)
            .set({
              model: parsedInput.model,
              auth: {
                authType: AuthType.secretText,
                secretText: parsedInput.apiKey,
              } as SecretTextAuthValue,
              temperature: parsedInput.temperature,
              maxOutputTokens: parsedInput.maxOutputTokens,
            })
            .where(eq(integrationDeepseekModel.id, integrationDeepseek.id))
        } else {
          const integration = await tx
            .insert(integrationModel)
            .values({
              id: createId(),
              workspaceId,
              integrationType: "deepseek",
            })
            .returning()
            .then((result) => result[0])

          await tx.insert(integrationDeepseekModel).values({
            id: createId(),
            integrationId: integration.id,
            workspaceId,
            model: parsedInput.model,
            auth: {
              authType: AuthType.secretText,
              secretText: parsedInput.apiKey,
            } as SecretTextAuthValue,
            temperature: parsedInput.temperature,
            maxOutputTokens: parsedInput.maxOutputTokens,
          })
        }
      })

      await aiIntegrationService.invalidateCache(
        workspaceId,
        aiProviders.enum.deepseek,
      )

      return
    },
  )
