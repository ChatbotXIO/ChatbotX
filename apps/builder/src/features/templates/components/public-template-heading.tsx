import type { PublicTemplateProjection } from "@chatbotx.io/business"
import { useTranslations } from "next-intl"

export type PublicTemplateHeadingTag = "h1" | "h2"

/**
 * The image, name and publisher the share page and the install page open
 * with. The name is the page's h1 there; under another page's own h1 (the
 * home page's Templates tab) it is an h2.
 */
export function PublicTemplateHeading({
  template,
  imageUrl,
  headingTag: Heading = "h1",
}: {
  template: Pick<PublicTemplateProjection, "name" | "publisherName">
  imageUrl: string
  headingTag?: PublicTemplateHeadingTag
}) {
  const t = useTranslations("templatesPublicPage")

  return (
    <div className="flex items-start gap-4 sm:gap-6">
      {/* biome-ignore lint/performance/noImgElement: external, unoptimized template thumbnail resolved from publisher-uploaded storage */}
      <img
        alt={template.name}
        className="size-20 shrink-0 rounded-lg bg-white object-cover sm:size-28"
        height={112}
        src={imageUrl}
        width={112}
      />
      <div className="min-w-0">
        <Heading className="break-words font-semibold text-2xl tracking-normal">
          {template.name}
        </Heading>
        {template.publisherName ? (
          <p className="mt-1 text-muted-foreground text-sm">
            {t("byPublisher", { publisherName: template.publisherName })}
          </p>
        ) : null}
      </div>
    </div>
  )
}
