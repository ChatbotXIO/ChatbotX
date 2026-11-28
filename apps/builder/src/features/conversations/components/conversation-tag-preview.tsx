"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { readableTextColor } from "@chatbotx.io/utils/color"
import { useTranslations } from "next-intl"
import { hiddenTagCount, ROW_TAG_PREVIEW_LIMIT } from "../lib/tag-preview"
import type { ContactTagPreviewResource } from "../schema/resource"

/**
 * The first few tags of a conversation's contact, then a count-only "+N" for
 * the rest. The hidden tags are not named: only the first
 * `ROW_TAG_PREVIEW_LIMIT` were loaded for the row. Renders nothing when the
 * contact has no tags, so rows without tags keep their height. Spans, not a
 * list: the row is a <button>, which only allows phrasing content.
 */
export function ConversationTagPreview({
  contact,
}: {
  // Partial: a row held in the client before the preview fields existed (an
  // older deploy's store) has neither, and renders as having no tags.
  contact: Partial<ContactTagPreviewResource>
}) {
  const t = useTranslations("conversationTags")
  const shown = (contact.tagPreview ?? []).slice(0, ROW_TAG_PREVIEW_LIMIT)
  const hidden = hiddenTagCount(contact.tagCount ?? 0, shown.length)
  if (shown.length === 0 && hidden === 0) {
    return null
  }

  return (
    <span className="flex min-w-0 items-center gap-1 overflow-hidden">
      {shown.map((tag) => (
        <Badge
          className="max-w-24 justify-start px-1.5 py-0 font-normal text-[10px]"
          key={tag.id}
          style={
            tag.color
              ? {
                  backgroundColor: tag.color,
                  color: readableTextColor(tag.color),
                }
              : undefined
          }
          title={tag.name}
          variant="secondary"
        >
          <span className="truncate">{tag.name}</span>
        </Badge>
      ))}
      {hidden > 0 && (
        <Badge
          aria-label={t("moreLabel", { count: hidden })}
          className="shrink-0 px-1.5 py-0 font-normal text-[10px]"
          variant="outline"
        >
          {t("more", { count: hidden })}
        </Badge>
      )}
    </span>
  )
}
