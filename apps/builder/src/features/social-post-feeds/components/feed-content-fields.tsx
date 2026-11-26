"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import {
  checkTemplate,
  convertLegacyTemplate,
} from "@chatbotx.io/utils/feed-template"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useRef, useState } from "react"
import type { z } from "zod"
import type { FeedDraft } from "../lib/feed-draft"
import { FEED_PRESET_MESSAGES } from "../lib/feed-labels"
import {
  FEED_FILTER_NAMES,
  FEED_MAX_TEMPLATE_LENGTH,
  FEED_TEMPLATE_EXAMPLE,
  FEED_TEMPLATE_PRESETS,
} from "../lib/feed-options"
import type { previewPostFeedResponse } from "../schema"
import { FeedFieldMenu } from "./feed-field-menu"
import { FeedNetworkTexts } from "./feed-network-texts"
import { FeedPreviewPanel } from "./feed-preview-panel"

type Preview = z.infer<typeof previewPostFeedResponse>

const selectClass =
  "h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

/**
 * The post text: a template with an "Insert field" menu fed by the fields of the
 * latest item, presets, a notice for a feed that still uses the old `{title}`
 * tokens, an inline error with its line and column, and the live preview.
 */
export const FeedContentFields = ({
  draft,
  isPreviewing,
  onChange,
  preview,
}: {
  draft: FeedDraft
  isPreviewing: boolean
  onChange: (patch: Partial<FeedDraft>) => void
  preview: Preview | null
}) => {
  const t = useTranslations()
  const area = useRef<HTMLTextAreaElement>(null)
  const [sample, setSample] = useState(0)
  const isLegacy = draft.templateSyntax === "legacy"
  const check = isLegacy ? null : checkTemplate(draft.textTemplate)
  const problem = check && !check.ok ? check : null
  const item =
    preview?.items[Math.min(sample, (preview?.items.length ?? 1) - 1)]

  const insert = (text: string) => {
    const element = area.current
    const start = element?.selectionStart ?? draft.textTemplate.length
    const end = element?.selectionEnd ?? start
    const next = `${draft.textTemplate.slice(0, start)}${text}${draft.textTemplate.slice(end)}`
    onChange({ textTemplate: next })
    requestAnimationFrame(() => {
      element?.focus()
      element?.setSelectionRange(start + text.length, start + text.length)
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor="feed-template">{t("posts.feeds.form.template")}</Label>
        {isLegacy ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <FeedFieldMenu fields={item?.fields ?? null} onInsert={insert} />
            <select
              aria-label={t("posts.feeds.form.templatePresets")}
              className={selectClass}
              onChange={(event) => {
                const key = event.target
                  .value as keyof typeof FEED_TEMPLATE_PRESETS
                if (Object.hasOwn(FEED_TEMPLATE_PRESETS, key)) {
                  onChange({ textTemplate: FEED_TEMPLATE_PRESETS[key] })
                }
              }}
              value=""
            >
              <option value="">{t("posts.feeds.form.templatePresets")}</option>
              {Object.keys(FEED_TEMPLATE_PRESETS).map((key) => (
                <option key={key} value={key}>
                  {t(
                    FEED_PRESET_MESSAGES[
                      key as keyof typeof FEED_PRESET_MESSAGES
                    ],
                  )}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <Textarea
        aria-describedby="feed-template-help"
        aria-invalid={problem ? true : undefined}
        className="font-mono text-sm"
        id="feed-template"
        maxLength={FEED_MAX_TEMPLATE_LENGTH}
        onChange={(event) => onChange({ textTemplate: event.target.value })}
        ref={area}
        rows={5}
        value={draft.textTemplate}
      />
      {problem ? (
        <p className="text-destructive text-xs" role="alert">
          {t("posts.feeds.form.templateProblem", {
            column: problem.column,
            line: problem.line,
            message: problem.message,
          })}
        </p>
      ) : null}
      {isLegacy ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2 text-xs">
          <span className="min-w-0 flex-1 basis-56">
            {t("posts.feeds.form.templateLegacy", { token: "{title}" })}
          </span>
          <Button
            onClick={() =>
              onChange({
                templateSyntax: "v2",
                textTemplate: convertLegacyTemplate(draft.textTemplate),
              })
            }
            size="sm"
            type="button"
            variant="outline"
          >
            {t("posts.feeds.form.templateConvert")}
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs" id="feed-template-help">
          {t("posts.feeds.form.templateHint", {
            example: FEED_TEMPLATE_EXAMPLE,
            filters: FEED_FILTER_NAMES,
          })}
        </p>
      )}
      {isLegacy ? null : (
        <FeedNetworkTexts
          draft={draft}
          item={item ?? null}
          onChange={onChange}
        />
      )}
      <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium text-sm">
            {t("posts.feeds.form.previewTitle")}
          </p>
          <div className="flex items-center gap-2">
            {isPreviewing ? (
              <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
            ) : null}
            {preview && preview.items.length > 1 ? (
              <select
                aria-label={t("posts.feeds.form.previewSample")}
                className={selectClass}
                onChange={(event) => setSample(Number(event.target.value))}
                value={sample}
              >
                {preview.items.map((entry, index) => (
                  <option key={entry.itemKey} value={index}>
                    {(entry.title ?? entry.link ?? "").slice(0, 50)}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </div>
        <FeedPreviewPanel isLegacy={isLegacy} item={item ?? null} />
      </div>
    </div>
  )
}
