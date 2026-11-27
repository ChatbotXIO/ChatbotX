import { Button } from "@chatbotx.io/ui/components/ui/button"
import { getPublicFileUrl } from "@chatbotx.io/utils"
import type { Metadata } from "next"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { PublicMessage } from "@/components/public-message"
import { PublicTemplateCard } from "@/features/templates/components/public-template-card"
import { getTenantSettings } from "@/features/tenant/utils"
import { findPublicTemplate, resolveTemplateImageUrl } from "./share-page-data"

type PublicTemplatePageProps = {
  params: Promise<{ shareToken: string }>
  searchParams: Promise<{ id?: string | string[] }>
}

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
  const t = await getTranslations("templatesPublicPage")

  const template = await findPublicTemplate(shareToken)
  if (!template) {
    return (
      <PublicMessage
        description={t("invalidDescription")}
        title={t("invalidTitle")}
      />
    )
  }

  // The install page's link names the template like this one does.
  const { id } = await props.searchParams
  const installQuery = new URLSearchParams({
    ...(typeof id === "string" ? { id } : {}),
    key: shareToken,
  })

  return (
    <main className="w-full">
      <PublicTemplateCard
        imageUrl={await resolveTemplateImageUrl(template.imageUrl)}
        install={
          <Button
            nativeButton={false}
            render={<Link href={`/t/template/install?${installQuery}`} />}
          >
            {t("install")}
          </Button>
        }
        template={template}
      />
    </main>
  )
}
