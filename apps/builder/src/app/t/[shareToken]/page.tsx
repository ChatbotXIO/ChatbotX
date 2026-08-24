import { templateService, workspaceMemberService } from "@chatbotx.io/business"
import { getPublicFileUrl } from "@chatbotx.io/utils"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { WorkspacePicker } from "@/features/templates/components/workspace-picker"
import { getTenantSettings } from "@/features/tenant/utils"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { getCurrentUser } from "@/lib/auth/utils"

export const metadata: Metadata = {
  title: "Template",
}

type PublicTemplatePageProps = {
  params: Promise<{ shareToken: string }>
}

/**
 * Every failure mode — bad token, disabled share, expired — collapses into
 * the same generic invalid-link message via one try/catch, mirroring
 * `/unsubscribe`. The page must never be a token-existence oracle.
 */
export default async function PublicTemplatePage(
  props: PublicTemplatePageProps,
) {
  const { shareToken } = await props.params
  const [t, tCategories] = await Promise.all([
    getTranslations("templatesPublicPage"),
    getTranslations("templates.categories"),
  ])

  const template = await templateService.findPublicByShareToken(shareToken)
  if (!template) {
    return (
      <TemplateMessage
        description={t("invalidDescription")}
        title={t("invalidTitle")}
      />
    )
  }

  const [user, { storageUrl }] = await Promise.all([
    getCurrentUser(),
    getTenantSettings(),
  ])
  const imageUrl = template.imageUrl
    ? getPublicFileUrl(template.imageUrl, storageUrl)
    : null

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16">
      {imageUrl ? (
        // biome-ignore lint/performance/noImgElement: external, unoptimized template thumbnail resolved from publisher-uploaded storage
        <img
          alt={template.name}
          className="aspect-video w-full rounded-lg object-cover"
          height={720}
          src={imageUrl}
          width={1280}
        />
      ) : null}
      <div>
        <h1 className="font-semibold text-2xl">{template.name}</h1>
        {template.publisherName ? (
          <p className="text-muted-foreground text-sm">
            {t("byPublisher", { publisherName: template.publisherName })}
          </p>
        ) : null}
      </div>
      {template.description ? (
        <p className="text-muted-foreground">{template.description}</p>
      ) : null}
      <TemplateCategorySummary
        categoryCounts={template.categoryCounts}
        categoryLabel={tCategories}
        label={t("includes")}
      />
      {template.testLink ? (
        <a
          className="text-primary text-sm underline"
          href={template.testLink}
          rel="noreferrer"
          target="_blank"
        >
          {t("tryItOut")}
        </a>
      ) : null}

      {user ? (
        <InstallSection
          shareToken={shareToken}
          tenantId={template.tenantId}
          userId={user.id}
        />
      ) : (
        <SignInPrompt label={t("signInToInstall")} shareToken={shareToken} />
      )}
    </div>
  )
}

async function InstallSection({
  shareToken,
  tenantId,
  userId,
}: {
  shareToken: string
  tenantId: string
  userId: string
}) {
  const t = await getTranslations("templatesPublicPage")
  const members = await workspaceMemberService.listByUserId({ userId })

  // The tenant filter here is UI convenience only — `installTemplateAction`
  // re-checks both membership (via `workspaceActionClient`) and the
  // same-tenant gate (via `templateService.assertInstallable`) server-side,
  // so a forged workspace id in a direct action call still fails.
  const installableWorkspaces = members
    .filter(
      (member) =>
        member.workspace.tenantId === tenantId &&
        hasWorkspacePermission(member.permissions, "superAdmin"),
    )
    .map((member) => member.workspace)

  if (installableWorkspaces.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("noEligibleWorkspaces")}
      </p>
    )
  }

  return (
    <WorkspacePicker
      shareToken={shareToken}
      workspaces={installableWorkspaces}
    />
  )
}

function SignInPrompt({
  shareToken,
  label,
}: {
  shareToken: string
  label: string
}) {
  return (
    <a
      className="inline-flex w-fit items-center rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm"
      href={`/auth/sign-in?callbackURL=${encodeURIComponent(`/t/${shareToken}`)}`}
    >
      {label}
    </a>
  )
}

function TemplateCategorySummary({
  categoryCounts,
  label,
  categoryLabel,
}: {
  categoryCounts: Record<string, number>
  label: string
  categoryLabel: (category: string) => string
}) {
  const nonZeroCategories = Object.entries(categoryCounts).filter(
    ([, count]) => count > 0,
  )
  if (nonZeroCategories.length === 0) {
    return null
  }
  return (
    <div>
      <p className="font-medium text-sm">{label}</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {nonZeroCategories.map(([category, count]) => (
          <li
            className="rounded-full bg-muted px-3 py-1 text-xs"
            key={category}
          >
            {categoryLabel(category)} ({count})
          </li>
        ))}
      </ul>
    </div>
  )
}

function TemplateMessage({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <div className="max-w-sm text-center">
        <h1 className="font-semibold text-xl">{title}</h1>
        <p className="mt-2 text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}
