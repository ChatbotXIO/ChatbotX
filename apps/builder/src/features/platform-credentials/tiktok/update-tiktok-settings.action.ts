"use server"

import { platformCredentialService, tenantService } from "@chatbotx.io/business"
import {
  type TiktokCredential,
  tiktokCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import { subscribeTiktokWebhooks } from "@chatbotx.io/integration-tiktok"
import { logger } from "@/lib/log"
import { getBrokerOrigin } from "@/lib/oauth-broker"
import {
  buildCredentialWebhookUrl,
  resolveTenantCustomDomainOrigin,
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

    const tenant = scopedUserId
      ? await tenantService.findByOwner(scopedUserId)
      : undefined
    const hasActiveTenant = tenant?.status === "active"
    const customDomainOrigin = scopedUserId
      ? await resolveTenantCustomDomainOrigin(scopedUserId)
      : null
    if (scopedUserId && hasActiveTenant && !customDomainOrigin) {
      await platformCredentialService.upsert({
        userId: scopedUserId,
        type: "tiktok",
        config,
      })
      return
    }
    const webhookOrigin = customDomainOrigin ?? getBrokerOrigin()
    const upsertCredential = () =>
      platformCredentialService.upsert({
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

    if (scopedUserId && !hasActiveTenant) {
      const previousCredential =
        await platformCredentialService.findDecryptedForUser({
          userId: scopedUserId,
          type: "tiktok",
          strict: true,
        })
      const credential = await upsertCredential()
      try {
        await subscribe(credential.id)
      } catch (error) {
        if (previousCredential) {
          await platformCredentialService.upsert({
            userId: scopedUserId,
            type: "tiktok",
            config: previousCredential.config,
          })
        } else {
          await platformCredentialService.remove({
            userId: scopedUserId,
            type: "tiktok",
          })
        }
        throw error
      }
      return
    }

    await subscribe()
    await upsertCredential()
  })
