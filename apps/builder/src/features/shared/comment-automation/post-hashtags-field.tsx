"use client"

import {
  COMMENT_POST_HASHTAG_MAX_LENGTH,
  COMMENT_POST_HASHTAGS_MAX,
  isValidCommentPostHashtag,
  normalizeCommentPostHashtag,
} from "@chatbotx.io/database/partials"
import { Alert, AlertDescription } from "@chatbotx.io/ui/components/ui/alert"
import { TagsInputField } from "@chatbotx.io/ui/components/ui/muhammada86/tags-input-field"
import { TriangleAlert } from "lucide-react"
import { useTranslations } from "next-intl"

/**
 * Stores a typed hashtag in the canonical form the worker compares against
 * (`#VIP` → `vip`), and drops one a caption could never carry (a space, `-`,
 * `.`) instead of saving a tag that silently never matches.
 */
function toStoredHashtag(raw: string): string {
  const tag = normalizeCommentPostHashtag(raw)
  return isValidCommentPostHashtag(tag) ? tag : ""
}

type Props = {
  /** Shown above the field, e.g. a TikTok connection that cannot read captions. */
  warning?: string | null
}

/**
 * The hashtag list of a `hashtags` post target: the automation answers a
 * comment only when the post's caption carries at least one of these.
 */
export function PostHashtagsField({ warning }: Props) {
  const t = useTranslations()

  return (
    <div className="space-y-2">
      {warning && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      )}
      <TagsInputField
        description={t("commentAutomation.postHashtags.description")}
        label={t("commentAutomation.postHashtags.label")}
        maxLength={COMMENT_POST_HASHTAG_MAX_LENGTH}
        maxTags={COMMENT_POST_HASHTAGS_MAX}
        name="post.value"
        placeholder={t("commentAutomation.postHashtags.placeholder")}
        transformTag={toStoredHashtag}
        variant="default"
      />
    </div>
  )
}
