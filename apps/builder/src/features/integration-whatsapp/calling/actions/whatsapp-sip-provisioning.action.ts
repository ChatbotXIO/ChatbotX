"use server"

import { sipProvisioningService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { integrationWhatsappRepository } from "@chatbotx.io/database/repositories"
import type { IntegrationWhatsappModel } from "@chatbotx.io/database/types"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import {
  getCallingSettings,
  updateCallingSettings,
} from "@chatbotx.io/integration-whatsapp/api/calling"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { resolveFreeswitchNodeIds } from "@/lib/freeswitch/nodes"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"

/**
 * Fetches Meta's SIP digest password for this number
 * (`GET /{pnid}/settings?include_sip_credentials=true`) — injected into
 * `sipProvisioningService.provision`, since `packages/business`
 * cannot import the WhatsApp integration package without a dependency
 * cycle.
 */
const fetchSipPassword = async (
  row: IntegrationWhatsappModel,
): Promise<string | undefined> => {
  const settings = await getCallingSettings(row.auth as WhatsappAuthValue, {
    includeSipCredentials: true,
  })
  return settings.sip?.servers?.[0]?.sip_user_password
}

/**
 * Provisions a WhatsApp number for FreeSWITCH calling: claims the
 * lease, pins the workspace to a node, stores Meta's SIP digest password,
 * and brings the FreeSWITCH gateway up. Super-admin only — provisioning
 * changes Meta billing surface (SIP calling) the same way the calling
 * settings toggle does.
 *
 * No `.inputSchema()` (bind args only) — callers invoke `execute()` with no
 * arguments, per the repo's no-input-action convention.
 */
export const provisionWhatsappSipAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async ({ bindArgsParsedInputs: [workspaceId, integrationId] }) => {
    const t = await getTranslations()
    await assertWorkspaceSuperAdmin(workspaceId)

    const integration =
      await integrationWhatsappRepository.findByIdForWorkspace({
        id: integrationId,
        workspaceId,
      })
    if (!integration) {
      throw new ChatbotXException(t("whatsapp.calls.errors.notFound"))
    }

    try {
      const provisioned = await sipProvisioningService.provision({
        workspaceId,
        integrationId,
        nodeIds: resolveFreeswitchNodeIds(),
        fetchSipPassword,
      })
      return { sipProvisioningStatus: provisioned.sipProvisioningStatus }
    } catch (error) {
      logger.error(
        { err: error, integrationId, workspaceId },
        "WhatsApp SIP provisioning failed",
      )
      throw new ChatbotXException(
        t("whatsapp.calls.sip.errors.provisionFailed"),
      )
    }
  })

/**
 * Reverses provisioning (rollback): disables Meta SIP first (via
 * the settings action, done separately by the caller), kills this
 * integration's own FreeSWITCH gateway, and clears the stored credentials.
 */
export const deprovisionWhatsappSipAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async ({ bindArgsParsedInputs: [workspaceId, integrationId] }) => {
    const t = await getTranslations()
    await assertWorkspaceSuperAdmin(workspaceId)

    try {
      const result = await sipProvisioningService.deprovision({
        workspaceId,
        integrationId,
        // Still `enabled`: Meta must stop routing to us before the gateway
        // goes away (rollback order).
        disableMetaSip: (row) =>
          updateCallingSettings(row.auth as WhatsappAuthValue, {
            sip: { status: "DISABLED" },
          }),
      })
      if (!result) {
        throw new ChatbotXException(t("whatsapp.calls.errors.notFound"))
      }
      return { sipProvisioningStatus: result.sipProvisioningStatus }
    } catch (error) {
      if (error instanceof ChatbotXException) {
        throw error
      }
      logger.error(
        { err: error, integrationId, workspaceId },
        "WhatsApp SIP deprovisioning failed",
      )
      throw new ChatbotXException(
        t("whatsapp.calls.sip.errors.deprovisionFailed"),
      )
    }
  })
