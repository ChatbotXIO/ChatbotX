import {
  buildContext,
  contactService,
  integrationFacebookAdsService,
  messengerIntegrationService,
  workspaceService,
} from "@chatbotx.io/business"
import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import type { FacebookCustomAudienceSchema } from "@chatbotx.io/flow-config"
import {
  type FacebookAdsAuthValue,
  facebookAdsAuthSchema,
  GRAPH_ERROR_CODE_INVALID_TOKEN,
  getGraphErrorCode,
  integration as integrationFacebookAds,
} from "@chatbotx.io/integration-facebook-ads"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../lib/logger"
import type { ExecuteStepProps } from "./flow"

// Fire-and-forget: the step never branches, so a failure is logged and the flow
// continues to the next step (implicit success). See the "log and continue"
// decision for the Facebook Custom Audience action.
export const handleFacebookCustomAudience = async (
  props: ExecuteStepProps<FacebookCustomAudienceSchema>,
): Promise<void> => {
  const { conversation, contactInbox, step } = props
  const workspaceId = conversation.workspaceId
  const logContext = {
    workspaceId,
    conversationId: conversation.id,
    stepId: step.id,
    customAudienceId: step.customAudienceId,
    operation: step.operation,
  }

  try {
    const [row, contact, workspace] = await Promise.all([
      integrationFacebookAdsService.findByWorkspaceIdOrFail(workspaceId),
      contactService.findByIdOrFail({
        workspaceId,
        id: conversation.contactId,
      }),
      workspaceService.findById({ id: workspaceId }),
    ])

    const auth = await encryptUtils.decryptObject(
      encryptedDataSchema.parse(row.auth),
      facebookAdsAuthSchema,
    )

    // Messenger identity is only available (and only needed) for normal
    // custom audiences; marketing-message audiences match on hashed PII.
    let psid: string | null = null
    let pageId: string | null = null
    if (contactInbox.channel === "messenger") {
      psid = contactInbox.sourceId
      const messengerIntegration = await messengerIntegrationService
        .findByInboxId(contactInbox.inboxId)
        .catch(() => null)
      pageId = messengerIntegration?.pageId ?? null
    }

    const ctx = await buildContext<FacebookAdsAuthValue>({
      workspaceId,
      integrationType: "facebookAds",
      integration: { ...row, auth },
    })

    await integrationFacebookAds.runAction("syncAudienceUser", {
      ctx,
      props: {
        customAudienceId: step.customAudienceId,
        operation: step.operation,
        psid,
        pageId,
        fallbackCountry: workspace.targetCountry,
        contact: {
          email: contact.email,
          phoneNumber: contact.phoneNumber,
          firstName: contact.firstName,
          lastName: contact.lastName,
          country: contact.country,
        },
      },
    })
  } catch (error) {
    if (getGraphErrorCode(error) === GRAPH_ERROR_CODE_INVALID_TOKEN) {
      // Expired/invalidated token — flag the integration so the settings
      // page shows "Reconnect".
      await integrationFacebookAdsService
        .markInvalid(workspaceId)
        .catch((e) =>
          logger.error(
            { ...logContext, err: normalizeError(e) },
            "Failed to mark Facebook Ads integration invalid",
          ),
        )
    }

    logger.error(
      { ...logContext, err: normalizeError(error) },
      "Facebook custom audience step failed",
    )
  }
}
