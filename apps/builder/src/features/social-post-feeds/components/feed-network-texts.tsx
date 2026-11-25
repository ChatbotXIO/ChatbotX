"use client"

import {
  type SocialProvider,
  socialProviders,
} from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import { checkTemplate } from "@chatbotx.io/utils/feed-template"
import { useTranslations } from "next-intl"
import { useRef, useState } from "react"
import type { z } from "zod"
import { PROVIDER_LABELS } from "@/features/social-posts/lib/composer-state"
import type { FeedDraft } from "../lib/feed-draft"
import { FEED_MAX_TEMPLATE_LENGTH } from "../lib/feed-options"
import type { previewPostFeedResponse } from "../schema"
import { FeedFieldMenu } from "./feed-field-menu"

type PreviewItem = z.infer<typeof previewPostFeedResponse>["items"][number]
type Tab = "shared" | SocialProvider

const hasText = (draft: FeedDraft, provider: SocialProvider): boolean =>
  Boolean(draft.templatesByProvider[provider]?.trim())

/**
 * "Different text per network": a collapsed section with a tab per network
 * (plus the shared text). A network tab holds its own template (same language,
 * the same Insert field menu) and previews what that network would get; an
 * empty one uses the shared text. Everything is advisory: the publishing rules
 * decide when the post is made, and nothing is ever cut to fit.
 */
export const FeedNetworkTexts = ({
  draft,
  item,
  onChange,
}: {
  draft: FeedDraft
  item: PreviewItem | null
  onChange: (patch: Partial<FeedDraft>) => void
}) => {
  const t = useTranslations()
  const area = useRef<HTMLTextAreaElement>(null)
  const [tab, setTab] = useState<Tab>("shared")
  const render = item?.render ?? null
  const own = tab === "shared" ? undefined : draft.templatesByProvider[tab]
  const check = own ? checkTemplate(own) : null
  const problem = check && !check.ok ? check : null
  const rendered =
    tab === "shared"
      ? null
      : (render?.providerTexts.find((entry) => entry.provider === tab) ?? null)

  const setOwn = (value: string) => {
    if (tab === "shared") {
      return
    }
    onChange({
      templatesByProvider: { ...draft.templatesByProvider, [tab]: value },
    })
  }
  const insert = (text: string) => {
    const element = area.current
    const current = own ?? ""
    const start = element?.selectionStart ?? current.length
    const end = element?.selectionEnd ?? start
    setOwn(`${current.slice(0, start)}${text}${current.slice(end)}`)
    requestAnimationFrame(() => {
      element?.focus()
      element?.setSelectionRange(start + text.length, start + text.length)
    })
  }
  const previewText = (): string => {
    if (tab === "shared") {
      return render?.text ?? ""
    }
    if (own?.trim()) {
      return rendered?.text ?? ""
    }
    return render?.text ?? ""
  }
  const providerProblem = rendered?.templateProblem ?? null
  const tabs: Tab[] = ["shared", ...socialProviders.options]

  return (
    <details
      className="rounded-lg border p-3"
      open={socialProviders.options.some((provider) =>
        hasText(draft, provider),
      )}
    >
      <summary className="cursor-pointer font-medium text-sm">
        {t("posts.feeds.form.networkTexts")}
      </summary>
      <div className="mt-2 space-y-2">
        <p className="text-muted-foreground text-xs">
          {t("posts.feeds.form.networkTextsHelp")}
        </p>
        <div
          aria-label={t("posts.feeds.form.networkTexts")}
          className="flex flex-wrap gap-1"
          role="tablist"
        >
          {tabs.map((name) => (
            <Button
              aria-selected={tab === name}
              key={name}
              onClick={() => setTab(name)}
              role="tab"
              size="sm"
              type="button"
              variant={tab === name ? "secondary" : "outline"}
            >
              {name === "shared"
                ? t("posts.feeds.form.networkTabShared")
                : PROVIDER_LABELS[name]}
              {name !== "shared" && hasText(draft, name) ? (
                <span aria-hidden="true" className="ms-1 text-primary">
                  •
                </span>
              ) : null}
            </Button>
          ))}
        </div>
        {tab === "shared" ? null : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-muted-foreground text-xs">
                {own?.trim()
                  ? null
                  : t("posts.feeds.form.networkTextUsesShared")}
              </span>
              <div className="flex items-center gap-2">
                <FeedFieldMenu
                  fields={item?.fields ?? null}
                  onInsert={insert}
                />
                {own ? (
                  <Button
                    onClick={() => setOwn("")}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    {t("posts.feeds.form.networkTextClear")}
                  </Button>
                ) : null}
              </div>
            </div>
            <Textarea
              aria-invalid={problem ? true : undefined}
              aria-label={t("posts.feeds.form.networkTextAria", {
                network: PROVIDER_LABELS[tab],
              })}
              className="font-mono text-sm"
              maxLength={FEED_MAX_TEMPLATE_LENGTH}
              onChange={(event) => setOwn(event.target.value)}
              ref={area}
              rows={4}
              value={own ?? ""}
            />
            {problem || providerProblem ? (
              <p className="text-destructive text-xs" role="alert">
                {t("posts.feeds.form.templateProblem", {
                  column: (problem ?? providerProblem)?.column ?? 0,
                  line: (problem ?? providerProblem)?.line ?? 0,
                  message: (problem ?? providerProblem)?.message ?? "",
                })}
              </p>
            ) : null}
          </div>
        )}
        <p className="whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 text-sm">
          {previewText()}
        </p>
      </div>
    </details>
  )
}
