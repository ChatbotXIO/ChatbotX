"use server"

import { platformCredentialService } from "@chatbotx.io/business"
import {
  type TiktokCredential,
  tiktokCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import { subscribeTiktokWebhooks } from "@chatbotx.io/integration-tiktok"
import { createId } from "@chatbotx.io/utils"
import { logger } from "@/lib/log"
import { getBrokerOrigin } from "@/lib/oauth-broker"
import {
  buildCredentialWebhookUrl,
  resolveCredentialOwnerOrigin,
} from "@/lib/provider-origin"
import { authActionClient } from "@/lib/safe-action"
import { credentialScopeSchema, resolveCredentialScopedUserId } from "../scope"

export const updateTiktokSettingAction = authActionClient
  .bindArgsSchemas([credentialScopeSchema])
  .inputSchema(tiktokCredentialUpdateSchema)
  .action(async ({ ctx, bindArgsParsedInputs: [scope], parsedInput }) => {
    const scopedUserId = await resolveCredentialScopedUserId(ctx.user, scope)
    const config: TiktokCredential = {
      clientId: parsedInput.clientId,
      clientSecret: parsedInput.clientSecret,
      features: parsedInput.features,
    }

    const { customDomainOrigin, hasActiveTenant } = scopedUserId
      ? await resolveCredentialOwnerOrigin(scopedUserId)
      : { customDomainOrigin: null, hasActiveTenant: false }
    const webhookOrigin = customDomainOrigin ?? getBrokerOrigin()
    const credentialId =
      scopedUserId && !hasActiveTenant
        ? ((
            await platformCredentialService.findForUser({
              userId: scopedUserId,
              type: "tiktok",
            })
          )?.id ?? createId())
        : undefined
    const upsertCredential = () =>
      platformCredentialService.upsert({
        ...(credentialId ? { id: credentialId } : {}),
        userId: scopedUserId,
        type: "tiktok",
        config,
      })
    const subscribe = async (credentialId?: string) => {
      // TikTok scopes a subscription to a single `event_type`, so DMs and
      // comments are two registrations against the same URL, each made only when
      // its feature is on. With both on, only the DM one may fail the save; with
      // messaging off, the comment one may — see `subscribeTiktokWebhooks`.
      const { messaging, comments } = await subscribeTiktokWebhooks(
        { clientId: config.clientId, clientSecret: config.clientSecret },
        buildCredentialWebhookUrl({
          credentialId,
          hasActiveTenant,
          origin: webhookOrigin,
          type: "tiktok",
        }),
        {
          features: config.features,
          onCommentSubscriptionError: (error) =>
            logger.error(
              { err: error, userId: scopedUserId },
              "TikTok comment webhook subscription failed; comments will not arrive",
            ),
        },
      )

      if (messaging && !comments && parsedInput.features.comments) {
        logger.warn(
          { userId: scopedUserId },
          "TikTok comment webhook is not subscribed; only direct messages will arrive",
        )
      }
    }

    await subscribe(credentialId)
    await upsertCredential()
  })
