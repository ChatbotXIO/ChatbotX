import {
  templateInstallationRequestService,
  templateService,
  workspaceMemberService,
} from "@chatbotx.io/business"
import { AspectRatio } from "@chatbotx.io/ui/components/ui/aspect-ratio"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@chatbotx.io/ui/components/ui/card"
import { Separator } from "@chatbotx.io/ui/components/ui/separator"
import { getPublicFileUrl } from "@chatbotx.io/utils"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { cache } from "react"
import { PublicMessage } from "@/components/public-message"
import { WorkspacePicker } from "@/features/templates/components/workspace-picker"
import { getTenantSettings } from "@/features/tenant/utils"
import { getCurrentUser } from "@/lib/auth/utils"

// Publisher-supplied free text. YouTube IDs are always 11 chars from this
// alphabet — validate before interpolating into an iframe src.
const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/

type PublicTemplatePageProps = {
  params: Promise<{ shareToken: string }>
}

/**
 * `generateMetadata` and the page body both need the template; `cache()`
 * dedupes the two calls into a single lookup per request.
 */
const findPublicTemplate = cache(async (shareToken: string) =>
  templateService.findPublicByShareToken(shareToken),
)

/**
 * Every failure mode — bad token, disabled share, expired — collapses into
 * the same generic invalid-link message and the same neutral title. The page
 * must never be a token-existence oracle, including in its link preview.
 */
export async function generateMetadata(
  props: PublicTemplatePageProps,
): Promise<Metadata> {
  const { shareToken } = await props.params
  const [t, template, { storageUrl }] = await Promise.all([
    getTranslations("templatesPublicPage"),
    findPublicTemplate(shareToken),
    getTenantSettings(),
  ])

  if (!template) {
    return { title: t("invalidTitle") }
  }

  const imageUrl = template.imageUrl
    ? getPublicFileUrl(template.imageUrl, storageUrl)
    : null

  return {
    title: template.name,
    description: template.description ?? undefined,
    openGraph: {
      title: template.name,
      description: template.description ?? undefined,
      images: imageUrl ? [imageUrl] : undefined,
    },
    twitter: {
      card: imageUrl ? "summary_large_image" : "summary",
      title: template.name,
      description: template.description ?? undefined,
      images: imageUrl ? [imageUrl] : undefined,
    },
  }
}

export default async function PublicTemplatePage(
  props: PublicTemplatePageProps,
) {
  const { shareToken } = await props.params
  const [t, tCategories] = await Promise.all([
    getTranslations("templatesPublicPage"),
    getTranslations("templates.categories"),
  ])

  const template = await findPublicTemplate(shareToken)
  if (!template) {
    return (
      <PublicMessage
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
  const validYoutubeVideoId =
    template.youtubeVideoId && YOUTUBE_VIDEO_ID_RE.test(template.youtubeVideoId)
      ? template.youtubeVideoId
      : null

  return (
    <main className="mx-auto w-full max-w-2xl py-4">
      <Card className="overflow-hidden py-0">
        {imageUrl ? (
          <AspectRatio ratio={16 / 9}>
            {/* biome-ignore lint/performance/noImgElement: external, unoptimized template thumbnail resolved from publisher-uploaded storage */}
            <img
              alt={template.name}
              className="h-full w-full object-cover"
              height={720}
              src={imageUrl}
              width={1280}
            />
          </AspectRatio>
        ) : null}

        <CardHeader className="pt-6">
          <h1 className="font-semibold text-3xl tracking-normal">
            {template.name}
          </h1>
          {template.publisherName ? (
            <p className="text-muted-foreground text-sm">
              {t("byPublisher", { publisherName: template.publisherName })}
            </p>
          ) : null}
        </CardHeader>

        <CardContent className="space-y-6">
          {template.description ? (
            <p className="text-muted-foreground">{template.description}</p>
          ) : null}

          {validYoutubeVideoId ? (
            <AspectRatio className="overflow-hidden rounded-lg" ratio={16 / 9}>
              <iframe
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen={true}
                className="h-full w-full"
                loading="lazy"
                src={`https://www.youtube-nocookie.com/embed/${validYoutubeVideoId}`}
                title={t("videoTitle")}
              />
            </AspectRatio>
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
        </CardContent>

        <Separator />

        <CardFooter className="flex flex-col items-stretch gap-3 bg-muted/40 py-6">
          {user ? (
            <InstallSection shareToken={shareToken} userId={user.id} />
          ) : (
            <SignInPrompt
              label={t("signInToInstall")}
              shareToken={shareToken}
            />
          )}
        </CardFooter>
      </Card>
    </main>
  )
}

async function InstallSection({
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
      <p className="text-muted-foreground text-sm">
        {t("noEligibleWorkspaces")}
      </p>
    )
  }

  // Inboxes the template was built around: the installer says which of their
  // own stand in for them. Offered per workspace, since the choice follows it.
  const channels = [
    ...new Set(requiredInboxes.map((inbox) => inbox.channelType)),
  ]
  const workspaceIds = installableWorkspaces.map((workspace) => workspace.id)
  const [inboxOptions, installedCopies] = await Promise.all([
    templateInstallationRequestService.listBindableInboxes({
      workspaceIds,
      channels,
    }),
    templateInstallationRequestService.listInstalledCopies({
      shareToken,
      workspaceIds,
    }),
  ])

  return (
    <WorkspacePicker
      inboxOptions={inboxOptions}
      installedCopies={installedCopies}
      requiredInboxes={requiredInboxes}
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
    <Button
      render={
        <a
          href={`/auth/sign-in?callbackURL=${encodeURIComponent(`/t/${shareToken}`)}`}
        >
          {label}
        </a>
      }
    />
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
      <div className="mt-2 flex flex-wrap gap-2">
        {nonZeroCategories.map(([category, count]) => (
          <Badge key={category} variant="secondary">
            {categoryLabel(category)} ({count})
          </Badge>
        ))}
      </div>
    </div>
  )
}
