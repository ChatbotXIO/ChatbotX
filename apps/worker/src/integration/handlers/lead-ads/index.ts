import {
  contactCustomFieldService,
  contactService,
  facebookLeadAdsAutomationService,
  facebookLeadAdsLeadService,
  isRichSystemContactField,
} from "@chatbotx.io/business"
import {
  contactSources,
  type FacebookLeadFieldMapping,
  FB_LEAD_STANDARD_FIELD_TARGET,
  genderTypes,
  type IntegrationType,
} from "@chatbotx.io/database/partials"
import {
  getLead,
  type LeadFieldDatum,
} from "@chatbotx.io/integration-messenger/apis/leadgen"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger/schema"
import type { IncomingContact } from "@chatbotx.io/sdk"
import type { IntegrationJobProcessLeadgen } from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"
import { integrationService } from "../../../services/integrations"
import { runFlowNode } from "../flow"
import { detectContactAndConversation } from "../received-message"

type Gender = (typeof genderTypes.options)[number]

const PSID_RE = /^\d+$/

const findValue = (
  fieldData: LeadFieldDatum[],
  name: string,
): string | undefined => fieldData.find((f) => f.name === name)?.values?.[0]

/**
 * Facebook click-to-Messenger lead forms carry an `inbox_url` like
 * `https://business.facebook.com/latest/<PSID>?nav_ref=...`. The last path
 * segment is the page-scoped id (PSID) used to resolve the contact.
 */
const extractPsidFromInboxUrl = (inboxUrl: string): string | undefined => {
  try {
    const segments = new URL(inboxUrl).pathname.split("/").filter(Boolean)
    const last = segments.at(-1)
    return last && PSID_RE.test(last) ? last : undefined
  } catch {
    return
  }
}

async function applyField(props: {
  workspaceId: string
  contactId: string
  target: string
  value: string
}): Promise<void> {
  const { workspaceId, contactId, target, value } = props
  try {
    if (target === "gender") {
      const normalized = value.trim().toLowerCase()
      if ((genderTypes.options as readonly string[]).includes(normalized)) {
        await contactService.update(
          { workspaceId, id: contactId },
          { gender: normalized as Gender },
        )
      }
      return
    }
    if (isRichSystemContactField(target)) {
      await contactService.setRichSystemFieldByKey({
        workspaceId,
        contactId,
        fieldName: target,
        value,
      })
      return
    }
    await contactCustomFieldService.setValueByKey({
      workspaceId,
      contactId,
      keyword: target,
      value,
    })
  } catch (error) {
    logger.warn(
      { error, target },
      "processLeadgen: failed to set contact field",
    )
  }
}

/**
 * Handle one Facebook `leadgen` webhook: resolve the page's Messenger inbox and
 * token, match a lead-ads automation for (workspace, page, form), fetch the
 * lead's answers, resolve the contact by PSID, write the mapped fields, send
 * the flow, and bump the counter. Deduped by (automation, leadgen_id) so
 * re-delivered webhooks no-op; the claim is released again if the work fails so
 * the job retry can pick the lead back up.
 */
export async function processLeadgen(
  data: IntegrationJobProcessLeadgen["data"],
): Promise<void> {
  const { integrationType, integrationIdentifier, leadgenId, formId } = data

  const { inbox, integrationRow } =
    await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
      integrationType as IntegrationType,
      integrationIdentifier,
    )

  const automation = await facebookLeadAdsAutomationService.findMatching({
    workspaceId: inbox.workspaceId,
    pageId: integrationIdentifier,
    formId,
  })
  if (!automation) {
    return
  }

  // Claim before any external work so Facebook webhook re-deliveries no-op.
  const claim = await facebookLeadAdsLeadService.claim({
    automationId: automation.id,
    leadgenId,
  })
  if (!claim) {
    return
  }

  try {
    const auth = integrationRow.auth as MessengerAuthValue
    const lead = await getLead(
      leadgenId,
      auth.tokens.accessToken,
      auth.metadata.version,
    )
    const fieldData = lead.field_data ?? []

    const inboxUrl = findValue(fieldData, "inbox_url")
    const psid = inboxUrl ? extractPsidFromInboxUrl(inboxUrl) : undefined
    if (!psid) {
      logger.info(
        { leadgenId },
        "processLeadgen: lead has no inbox_url/PSID, skipping",
      )
      return
    }

    const incomingContact: IncomingContact = {
      sourceId: psid,
      firstName: findValue(fieldData, "full_name"),
    }

    const { contact, contactInbox, conversation } =
      await detectContactAndConversation({
        incomingContact,
        inbox,
        integrationRow,
        source: contactSources.enum.ads,
      })

    await facebookLeadAdsLeadService.setContactId({
      id: claim.id,
      contactId: contact.id,
    })

    // Specific-form automations carry an explicit mapping; the "all forms"
    // automation auto-maps recognized standard fields.
    const mapping: FacebookLeadFieldMapping[] =
      automation.fieldMapping.length > 0
        ? automation.fieldMapping
        : fieldData
            .filter((f) => FB_LEAD_STANDARD_FIELD_TARGET[f.name])
            .map((f) => ({
              key: f.name,
              label: f.name,
              type: "",
              target: FB_LEAD_STANDARD_FIELD_TARGET[f.name] ?? null,
            }))

    for (const entry of mapping) {
      if (!entry.target || entry.key === "inbox_url") {
        continue
      }
      const value = findValue(fieldData, entry.key)
      if (value === undefined) {
        continue
      }
      await applyField({
        workspaceId: inbox.workspaceId,
        contactId: contact.id,
        target: entry.target,
        value,
      })
    }

    if (automation.flowId) {
      await runFlowNode({
        flowId: automation.flowId,
        conversationId: conversation,
        contactInboxId: contactInbox,
        origin: "channel",
      })
    }

    await facebookLeadAdsAutomationService.incrementLeadsHandled(automation.id)
  } catch (error) {
    // Release the claim so the job retry can reprocess this lead — leaving it
    // in place would make every retry a no-op and drop the lead permanently.
    try {
      await facebookLeadAdsLeadService.release({ id: claim.id })
    } catch (releaseError) {
      logger.error(
        { error: releaseError, leadgenId },
        "processLeadgen: failed to release lead claim",
      )
    }
    throw error
  }
}
