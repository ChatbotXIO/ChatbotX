"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { tintedBadgeStyle } from "@chatbotx.io/utils/color"
import { useTranslations } from "next-intl"
import {
  hiddenTagCount,
  ROW_PILL_CLASS,
  ROW_TAG_PREVIEW_LIMIT,
} from "../lib/tag-preview"
import type { ContactTagPreviewResource } from "../schema/resource"

/**
 * The first few tags of a conversation's contact, then a count-only "+N" for
 * the rest. The hidden tags are not named: only the first
 * `ROW_TAG_PREVIEW_LIMIT` were loaded for the row. Renders nothing when the
 * contact has no tags, so rows without tags keep their height. It sits last on the row's bottom
 * badge line, after the other pills, and is the part that gives way when the
 * line is full. Spans, not a
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

  // Inline style, not classes: the tint comes from the tag's own color.
  return (
    <span className="flex min-w-0 items-center gap-1">
      {/* Only the tags clip when the line is full; the "+N" sits outside. */}
      <span className="flex min-w-0 items-center gap-1 overflow-hidden">
        {shown.map((tag) => (
          <Badge
            className={`${ROW_PILL_CLASS} min-w-0 max-w-20 shrink justify-start`}
            key={tag.id}
            style={tintedBadgeStyle(tag.color)}
            title={tag.name}
            variant="outline"
          >
            <span className="truncate">{tag.name}</span>
          </Badge>
        ))}
      </span>
      {hidden > 0 && (
        <Badge
          aria-label={t("moreLabel", { count: hidden })}
          className={`${ROW_PILL_CLASS} shrink-0`}
          style={tintedBadgeStyle(null)}
          variant="outline"
        >
          {t("more", { count: hidden })}
        </Badge>
      )}
    </span>
  )
}
