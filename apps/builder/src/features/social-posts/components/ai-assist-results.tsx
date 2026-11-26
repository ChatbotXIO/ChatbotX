"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { useTranslations } from "next-intl"
import type { z } from "zod"
import type { generatePostTextResource } from "@/features/social-posts-ai/schema"
import { PROVIDER_LABELS } from "../lib/composer-state"

export type AiSuggestion = z.infer<typeof generatePostTextResource>
type AiVariant = AiSuggestion["variants"][number]

/** The suggestions of one call: a card per option, or a chip per hashtag. */
export const AiAssistResults = ({
  onApplyToNetworks,
  onHashtag,
  onInsert,
  onReplace,
  postText,
  suggestion,
}: {
  onApplyToNetworks: (variants: AiVariant[]) => void
  onHashtag: (tag: string) => void
  onInsert: (text: string) => void
  onReplace: (text: string) => void
  postText: string
  suggestion: AiSuggestion
}) => {
  const t = useTranslations()
  const variantHeading = (variant: AiVariant, index: number): string | null => {
    if (variant.provider) {
      return PROVIDER_LABELS[variant.provider]
    }
    return suggestion.variants.length > 1
      ? t("composer.aiOption", { number: index + 1 })
      : null
  }
  const perNetwork = suggestion.variants.filter((variant) => variant.provider)
  if (suggestion.hashtags.length > 0) {
    return (
      <div className="space-y-2 border-t pt-3">
        <p className="font-medium text-sm">{t("composer.aiHashtagPick")}</p>
        <ul
          className="flex flex-wrap gap-1.5"
          data-testid="composer-ai-hashtags"
        >
          {suggestion.hashtags.map((tag) => (
            <li key={tag}>
              <Button
                disabled={postText.includes(tag)}
                onClick={() => onHashtag(tag)}
                size="sm"
                type="button"
                variant="outline"
              >
                {tag}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    )
  }
  return (
    <div className="space-y-3 border-t pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-sm">{t("composer.aiSuggestion")}</p>
        {perNetwork.length >= 2 ? (
          <Button
            onClick={() => onApplyToNetworks(perNetwork)}
            size="sm"
            type="button"
          >
            {t("composer.aiApplyToEach")}
          </Button>
        ) : null}
      </div>
      {suggestion.variants.map((variant, index) => (
        <div className="space-y-2" key={variant.text}>
          <p className="text-muted-foreground text-xs">
            {variantHeading(variant, index)}
          </p>
          <p
            className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-2 text-sm"
            data-testid="composer-ai-suggestion"
          >
            {variant.text}
          </p>
          {variant.truncated && variant.limit !== null ? (
            <p className="text-muted-foreground text-xs">
              {t("composer.aiCutToLimit", { limit: variant.limit })}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {variant.provider ? (
              <Button
                onClick={() => onApplyToNetworks([variant])}
                size="sm"
                type="button"
              >
                {t("composer.aiApplyTo", {
                  network: PROVIDER_LABELS[variant.provider],
                })}
              </Button>
            ) : (
              <>
                <Button
                  onClick={() => onInsert(variant.text)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {t("composer.aiInsert")}
                </Button>
                <Button
                  onClick={() => onReplace(variant.text)}
                  size="sm"
                  type="button"
                >
                  {t("composer.aiReplace")}
                </Button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
