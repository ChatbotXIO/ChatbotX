"use server"

import {
  assertSipProvisioningTransition,
  buildContext,
  integrationWhatsappService,
  resolveFreeswitchNode,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { SipProvisioningStatus } from "@chatbotx.io/database/partials"
import { integrationWhatsappRepository } from "@chatbotx.io/database/repositories"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import {
  getCallingSettings,
  type WhatsappCallingSettings,
} from "@chatbotx.io/integration-whatsapp/api/calling"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { integrations } from "@/integration"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { resolveFreeswitchNodes } from "@/lib/freeswitch/nodes"
import { workspaceActionClient } from "@/lib/safe-action"
import { throwWhatsappApiActionError } from "../../libs/whatsapp-api-action-error"
import {
  type UpdateWhatsappCallingSettingsSchema,
  updateWhatsappCallingSettingsSchema,
} from "../schemas/update-calling-settings-schema"

const SIP_PORT = 5061
/** Meta's calling-settings reference: extra codecs alongside Opus. */
const SIP_ADDITIONAL_CODECS = ["PCMA", "PCMU"] as const

/**
 * Builds the SIP payload for the FreeSWITCH gate:
 * `sip.status: ENABLED`, `webhook_delivery: ENABLED` (keeps `calls`
 * lifecycle webhooks flowing), one server entry (Meta allows only one per
 * app) pointing at the integration's pinned node hostname, SDES SRTP, and
 * Opus + the two extra codecs.
 */
const buildEnableSipPayload = (
  sipDomain: string,
): Partial<WhatsappCallingSettings> => ({
  sip: {
    status: "ENABLED",
    webhook_delivery: "ENABLED",
    servers: [{ hostname: sipDomain, port: SIP_PORT }],
  },
  srtp_key_exchange_protocol: "SDES",
  audio: { additional_codecs: [...SIP_ADDITIONAL_CODECS] },
})

const buildDisableSipPayload = (): Partial<WhatsappCallingSettings> => ({
  sip: { status: "DISABLED" },
})

/**
 * Meta must receive the node's public SIP hostname (`FS_NODES[nodeId].sipDomain`),
 * never the internal node id the integration is pinned to.
 */
const resolveSipDomainForNode = (nodeId: string): string =>
  resolveFreeswitchNode(resolveFreeswitchNodes(), nodeId).sipDomain

export const updateWhatsappCallingSettingsAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateWhatsappCallingSettingsSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId, integrationWhatsappId],
    }: {
      parsedInput: UpdateWhatsappCallingSettingsSchema
      bindArgsParsedInputs: readonly [string, string]
    }) => {
      const t = await getTranslations()
      // Calling settings affect Meta billing (business-initiated calls are
      // paid) — gate on super admin like connect/reconnect, not mere
      // membership.
      await assertWorkspaceSuperAdmin(workspaceId)
      const integrationWhatsapp =
        await integrationWhatsappService.findWorkspaceIntegration({
          id: integrationWhatsappId,
          workspaceId,
        })
      if (!integrationWhatsapp) {
        throw new ChatbotXException(t("whatsapp.calls.errors.notFound"))
      }

      const data: Partial<WhatsappCallingSettings> = {}
      if (parsedInput.status) {
        data.status = parsedInput.status
      }
      if (parsedInput.callIconVisibility) {
        data.call_icon_visibility = parsedInput.callIconVisibility
      }
      if (parsedInput.callbackPermissionStatus) {
        data.callback_permission_status = parsedInput.callbackPermissionStatus
      }

      if (parsedInput.sipEnabled !== undefined) {
        if (parsedInput.sipEnabled) {
          if (integrationWhatsapp.sipProvisioningStatus !== "provisioned") {
            throw new ChatbotXException(
              t("whatsapp.calls.sip.errors.notProvisioned"),
            )
          }
          if (!integrationWhatsapp.sipNodeId) {
            throw new ChatbotXException(
              t("whatsapp.calls.sip.errors.notProvisioned"),
            )
          }
          Object.assign(
            data,
            buildEnableSipPayload(
              resolveSipDomainForNode(integrationWhatsapp.sipNodeId),
            ),
          )
        } else {
          Object.assign(data, buildDisableSipPayload())
        }
      }

      const localValues: Partial<{
        callRecordingEnabled: boolean
        callRecordingRetentionDays: number
        callTranscriptionEnabled: boolean
      }> = {}
      if (parsedInput.recordingEnabled !== undefined) {
        localValues.callRecordingEnabled = parsedInput.recordingEnabled
      }
      if (parsedInput.callRecordingRetentionDays !== undefined) {
        localValues.callRecordingRetentionDays =
          parsedInput.callRecordingRetentionDays
      }
      if (parsedInput.callTranscriptionEnabled !== undefined) {
        localValues.callTranscriptionEnabled =
          parsedInput.callTranscriptionEnabled
      }
      if (Object.keys(localValues).length > 0) {
        await integrationWhatsappRepository.updateCallSettings({
          id: integrationWhatsappId,
          workspaceId,
          values: localValues,
        })
      }

      // A pure local toggle needs no Meta round-trip.
      if (Object.keys(data).length === 0) {
        return
      }

      const ctx = await buildContext({
        workspaceId,
        integrationType: "whatsapp",
        integration: {
          ...integrationWhatsapp,
          auth: integrationWhatsapp.auth as WhatsappAuthValue,
        },
      })
      try {
        await integrations.whatsapp.runAction("updateCallingSettings", {
          ctx,
          data,
        })
      } catch (error) {
        // Meta explains the refusal (messaging tier too low, coexistence
        // number, …) in `error_user_msg` — surface that instead of a label.
        throwWhatsappApiActionError(
          error,
          t("whatsapp.calls.errors.updateFailed"),
        )
      }

      if (parsedInput.sipEnabled === undefined) {
        return
      }

      // Read back and assert the write actually took: Meta can
      // silently reject a SIP change without throwing (e.g. the read-only
      // fields get ignored). Only then flip the local state machine.
      const readBack = await getCallingSettings(
        integrationWhatsapp.auth as WhatsappAuthValue,
      )
      const expectedStatus = parsedInput.sipEnabled ? "ENABLED" : "DISABLED"
      if (readBack.sip?.status !== expectedStatus) {
        throw new ChatbotXException(
          t("whatsapp.calls.sip.errors.readBackMismatch"),
        )
      }

      const nextStatus: SipProvisioningStatus = parsedInput.sipEnabled
        ? "enabled"
        : "provisioned"
      assertSipProvisioningTransition(
        integrationWhatsapp.sipProvisioningStatus as SipProvisioningStatus,
        nextStatus,
      )
      if (!integrationWhatsapp.sipProvisioningClaim) {
        throw new ChatbotXException(
          t("whatsapp.calls.sip.errors.readBackMismatch"),
        )
      }

      const updated = await integrationWhatsappRepository.updateSipProvisioning(
        {
          id: integrationWhatsappId,
          workspaceId,
          claim: integrationWhatsapp.sipProvisioningClaim,
          values: { sipProvisioningStatus: nextStatus },
        },
      )
      if (!updated) {
        throw new ChatbotXException(
          t("whatsapp.calls.sip.errors.readBackMismatch"),
        )
      }
    },
  )
