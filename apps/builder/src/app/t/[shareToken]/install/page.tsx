import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { PublicMessage } from "@/components/public-message"
import { InstallSection } from "@/features/templates/components/public-install-section"
import { PublicTemplateHeading } from "@/features/templates/components/public-template-heading"
import {
  findPublicTemplate,
  getShareViewer,
  resolveTemplateImageUrl,
} from "../share-page-data"

type PublicTemplateInstallPageProps = {
  params: Promise<{ shareToken: string }>
}

export async function generateMetadata(
  props: PublicTemplateInstallPageProps,
): Promise<Metadata> {
  const { shareToken } = await props.params
  const [t, template] = await Promise.all([
    getTranslations("templatesPublicPage"),
    findPublicTemplate(shareToken),
  ])
  return { title: template?.name ?? t("invalidTitle") }
}

/** Where the share page's Install leads: choose the workspace to install into. */
export default async function PublicTemplateInstallPage(
  props: PublicTemplateInstallPageProps,
) {
  const { shareToken } = await props.params
  const [t, template, viewer] = await Promise.all([
    getTranslations("templatesPublicPage"),
    findPublicTemplate(shareToken),
    getShareViewer(),
  ])
  if (!template) {
    return (
      <PublicMessage
        description={t("invalidDescription")}
        title={t("invalidTitle")}
      />
    )
  }
  if (!viewer) {
    redirect(
      `/auth/sign-in?callbackURL=${encodeURIComponent(`/t/${shareToken}/install`)}`,
    )
  }

  return (
    <main className="flex w-full flex-col gap-8">
      <Card>
        <CardContent>
          <PublicTemplateHeading
            imageUrl={await resolveTemplateImageUrl(template.imageUrl)}
            template={template}
          />
        </CardContent>
      </Card>
      <InstallSection shareToken={shareToken} userId={viewer.id} />
    </main>
  )
}
