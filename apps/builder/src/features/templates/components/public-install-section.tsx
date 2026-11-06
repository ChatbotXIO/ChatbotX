import {
  templateInstallationRequestService,
  workspaceMemberService,
} from "@chatbotx.io/business"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { getPublicFileUrl } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import type { ComponentProps } from "react"
import { getTenantSettings } from "@/features/tenant/utils"
import { CreateWorkspaceFromTemplateLink } from "./create-workspace-from-template-link"
import { WorkspacePicker } from "./workspace-picker"

export async function InstallSection({
  shareToken,
  userId,
}: {
  shareToken: string
  userId: string
}) {
  const t = await getTranslations("templatesPublicPage")
  // The member list and the template's inbox manifest do not depend on each other.
  const [members, requiredInboxes] = await Promise.all([
    workspaceMemberService.listByUserId({ userId }),
    templateInstallationRequestService.findInboxManifestByShareToken(
      shareToken,
    ),
  ])

  // The tenant and category filter here is UI convenience only —
  // `installTemplateAction` re-checks both membership (via
  // `workspaceActionClient`) and the same-tenant gate and per-category
  // permissions (via `templateService.assertInstallable`) server-side,
  // so a forged workspace id in a direct action call still fails.
  const installableWorkspaces =
    await templateInstallationRequestService.filterInstallableWorkspaces({
      shareToken,
      members,
    })

  if (installableWorkspaces.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3">
        <p className="text-muted-foreground text-sm">
          {t("noEligibleWorkspaces")}
        </p>
        <CreateWorkspaceFromTemplateLink
          label={t("createWorkspace")}
          shareToken={shareToken}
        />
      </div>
    )
  }

  // Inboxes the template was built around: the installer says which of their
  // own stand in for them. Offered per workspace, since the choice follows it.
  const channels = [
    ...new Set(requiredInboxes.map((inbox) => inbox.channelType)),
  ]
  const workspaceIds = installableWorkspaces.map((workspace) => workspace.id)
  const [inboxOptions, installedCopies, { storageUrl }] = await Promise.all([
    templateInstallationRequestService.listBindableInboxes({
      workspaceIds,
      channels,
    }),
    templateInstallationRequestService.listInstalledCopies({
      shareToken,
      workspaceIds,
    }),
    getTenantSettings(),
  ])

  return (
    <div className="flex flex-col items-center gap-6">
      <WorkspacePicker
        inboxOptions={inboxOptions}
        installedCopies={installedCopies}
        requiredInboxes={requiredInboxes}
        shareToken={shareToken}
        workspaces={installableWorkspaces.map((workspace) => ({
          id: workspace.id,
          name: workspace.name,
          crossTenant: workspace.crossTenant,
          logoUrl: workspace.logo
            ? getPublicFileUrl(workspace.logo, storageUrl)
            : null,
        }))}
      />
      <CreateWorkspaceFromTemplateLink
        label={t("createWorkspace")}
        shareToken={shareToken}
      />
    </div>
  )
}

export function SignInPrompt({
  shareToken,
  label,
  variant,
}: {
  shareToken: string
  label: string
  variant?: ComponentProps<typeof Button>["variant"]
}) {
  return (
    <Button
      nativeButton={false}
      render={
        <a
          href={`/auth/sign-in?callbackURL=${encodeURIComponent(`/t/${shareToken}`)}`}
        >
          {label}
        </a>
      }
      variant={variant}
    />
  )
}
