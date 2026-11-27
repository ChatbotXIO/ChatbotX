import type { templateService } from "@chatbotx.io/business"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { EyeIcon } from "lucide-react"
import { getTranslations } from "next-intl/server"
import type { ReactNode } from "react"
import { safeHttpUrl } from "../lib/safe-http-url"
import {
  PublicTemplateHeading,
  type PublicTemplateHeadingTag,
} from "./public-template-heading"

type PublicTemplate = NonNullable<
  Awaited<ReturnType<typeof templateService.findPublicByShareToken>>
>

type PublicTemplateCardProps = {
  template: PublicTemplate
  /** The template's cover, or the tenant's icon when it has none. */
  imageUrl: string
  install: ReactNode
  headingTag?: PublicTemplateHeadingTag
}

export async function PublicTemplateCard({
  template,
  imageUrl,
  install,
  headingTag,
}: PublicTemplateCardProps) {
  const t = await getTranslations("templatesPublicPage")
  // Saved links are checked too, but older rows predate that check.
  const testLink = safeHttpUrl(template.testLink)

  return (
    <Card>
      <CardContent className="flex flex-col gap-8 sm:p-8">
        <PublicTemplateHeading
          headingTag={headingTag}
          imageUrl={imageUrl}
          template={template}
          video={template.video}
          videoTitle={t("videoTitle")}
        />

        <div className="flex flex-wrap justify-end gap-3">
          {testLink ? (
            <Button
              nativeButton={false}
              render={
                <a href={testLink} rel="noopener noreferrer" target="_blank">
                  <EyeIcon />
                  {t("preview")}
                </a>
              }
              variant="outline"
            />
          ) : null}
          {install}
        </div>

        {template.description ? (
          <section>
            <h2 className="font-medium text-sm">{t("aboutTemplate")}</h2>
            <p className="mt-2 whitespace-pre-line break-words text-muted-foreground text-sm">
              {template.description}
            </p>
          </section>
        ) : null}
      </CardContent>
    </Card>
  )
}
