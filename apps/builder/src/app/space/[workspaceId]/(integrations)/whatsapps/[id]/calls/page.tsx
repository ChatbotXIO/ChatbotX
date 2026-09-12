import type { SipProvisioningStatus } from "@chatbotx.io/database/partials"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import {
  getCallingSettings,
  type WhatsappCallingSettings,
} from "@chatbotx.io/integration-whatsapp/api/calling"
import { notFound } from "next/navigation"
import { getWhatsappCallingPreflight } from "@/features/integration-whatsapp/calling/get-whatsapp-calling-preflight"
import { WhatsappCallsCard } from "@/features/integration-whatsapp/calling/whatsapp-calls-card"
import { findIntegrationWhatsapp } from "@/features/integration-whatsapp/queries"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

export default async function WhatsappCallsPage(props: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }

  const [integrationWhatsapp, currentUserAndWorkspace] = await Promise.all([
    findIntegrationWhatsapp({
      workspaceId: data.workspaceId,
      id: data.id,
    }),
    getCurrentUserAndTargetWorkspace(data.workspaceId),
  ])
  const auth = integrationWhatsapp.auth as WhatsappAuthValue

  let settings: WhatsappCallingSettings | null = null
  let loadError: string | undefined
  try {
    settings = await getCallingSettings(auth)
  } catch (err) {
    loadError = err instanceof Error ? err.message : "unknown"
  }

  const preflight = currentUserAndWorkspace
    ? await getWhatsappCallingPreflight({
        workspace: currentUserAndWorkspace.targetWorkspace,
        auth,
      })
    : null
  const isSuperAdmin = currentUserAndWorkspace
    ? hasWorkspacePermission(
        currentUserAndWorkspace.targetWorkspaceMember.permissions,
        "superAdmin",
      )
    : false

  return (
    <WhatsappCallsCard
      integrationWhatsappId={data.id}
      isSuperAdmin={isSuperAdmin}
      loadError={loadError}
      preflight={preflight}
      recordingEnabled={integrationWhatsapp.callRecordingEnabled}
      recordingRetentionDays={integrationWhatsapp.callRecordingRetentionDays}
      settings={settings}
      // The `sipProvisioningStatus` pgEnum column erases to `string` at the
      // Drizzle inference boundary (its zod enum isn't threaded through the
      // `pgEnum(...)` call in `packages/database/src/schema/integration-whatsapp.ts`)
      // — narrow it here rather than widen the prop type.
      sipProvisioningStatus={
        integrationWhatsapp.sipProvisioningStatus as SipProvisioningStatus
      }
      transcriptionEnabled={integrationWhatsapp.callTranscriptionEnabled}
      workspaceId={data.workspaceId}
    />
  )
}
