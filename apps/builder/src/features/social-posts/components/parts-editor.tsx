"use client"

import type { SocialProvider } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { measureText } from "@chatbotx.io/utils/post-publishing"
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useIssueMessages } from "../hooks/use-composer-labels"
import type {
  ComposerIssue,
  ComposerNetworkRules,
  ComposerTarget,
} from "../lib/composer-state"

export type ComposerPartsRule = NonNullable<ComposerNetworkRules["parts"]>

type PartsChange = Pick<ComposerTarget, "firstComment" | "parts">

/** `used/limit`, counted in the network's own unit; red when over. */
const PartCounter = ({
  max,
  provider,
  value,
}: {
  max: number
  provider: SocialProvider
  value: string
}) => {
  const used = measureText(provider, value.trim())
  return (
    <span
      aria-invalid={used > max || undefined}
      aria-live="polite"
      className={cn(
        "text-xs tabular-nums",
        used > max ? "font-medium text-destructive" : "text-muted-foreground",
      )}
    >
      {used}/{max}
    </span>
  )
}

const moved = (
  parts: readonly string[],
  index: number,
  step: -1 | 1,
): string[] => {
  const target = index + step
  const next = parts.slice()
  const current = next[index]
  const other = next[target]
  if (current === undefined || other === undefined) {
    return next
  }
  next[index] = other
  next[target] = current
  return next
}

const issuesFor = (
  issues: readonly ComposerIssue[],
  field: ComposerIssue["field"],
  partIndex: number,
): ComposerIssue[] =>
  issues.filter(
    (issue) => issue.field === field && issue.partIndex === partIndex,
  )

/**
 * The follow-ups of one destination: thread parts (each a reply to the one
 * before it) and the first comment. Rendered only for a network whose rules
 * offer them; the limits come from the registry, never from here.
 */
export const PartsEditor = ({
  disabled,
  firstComment,
  issues,
  onChange,
  parts,
  provider,
  rule,
}: {
  disabled: boolean
  firstComment: string
  issues: readonly ComposerIssue[]
  onChange: (changes: PartsChange) => void
  parts: readonly string[]
  provider: SocialProvider
  rule: ComposerPartsRule
}) => {
  const t = useTranslations()
  const issueMessages = useIssueMessages()
  const used = parts.length + (firstComment.trim() ? 1 : 0)
  const remaining = Math.max(rule.maxParts - used, 0)
  const emit = (next: Partial<PartsChange>) =>
    onChange({ firstComment, parts: parts.slice(), ...next })

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="font-medium text-sm">{t("composer.partsTitle")}</p>
        <p className="text-muted-foreground text-xs">
          {t("composer.partsHint")}
        </p>
      </div>
      <ol className="space-y-2">
        {parts.map((text, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts have no id until saved; the field is controlled
          <li className="space-y-1" key={index}>
            <div className="flex items-center gap-1">
              <p className="flex-1 text-muted-foreground text-xs">
                {t("composer.partLabel", { number: index + 1 })}
              </p>
              <Button
                aria-label={t("composer.partMoveUp")}
                disabled={disabled || index === 0}
                onClick={() => emit({ parts: moved(parts, index, -1) })}
                size="icon"
                type="button"
                variant="ghost"
              >
                <ArrowUpIcon />
              </Button>
              <Button
                aria-label={t("composer.partMoveDown")}
                disabled={disabled || index === parts.length - 1}
                onClick={() => emit({ parts: moved(parts, index, 1) })}
                size="icon"
                type="button"
                variant="ghost"
              >
                <ArrowDownIcon />
              </Button>
              <Button
                aria-label={t("composer.partRemove")}
                disabled={disabled}
                onClick={() =>
                  emit({ parts: parts.filter((_, at) => at !== index) })
                }
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash2Icon />
              </Button>
            </div>
            <Textarea
              aria-label={t("composer.partLabel", { number: index + 1 })}
              disabled={disabled}
              onChange={(event) =>
                emit({
                  parts: parts.map((part, at) =>
                    at === index ? event.target.value : part,
                  ),
                })
              }
              placeholder={t("composer.partPlaceholder")}
              rows={3}
              value={text}
            />
            <div className="flex items-start justify-between gap-2">
              <ul className="space-y-0.5 text-destructive text-xs">
                {issuesFor(issues, `parts[${index}].text`, index).map(
                  (issue) => (
                    <li key={issue.code}>{issueMessages[issue.code]}</li>
                  ),
                )}
              </ul>
              {rule.maxPartChars === null ? null : (
                <PartCounter
                  max={rule.maxPartChars}
                  provider={provider}
                  value={text}
                />
              )}
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={disabled || remaining === 0}
          onClick={() => emit({ parts: [...parts, ""] })}
          size="sm"
          type="button"
          variant="outline"
        >
          <PlusIcon />
          {t("composer.partsAdd")}
        </Button>
        <span className="text-muted-foreground text-xs">
          {t("composer.partsRemaining", { count: remaining })}
        </span>
      </div>
      {rule.firstComment ? (
        <div className="space-y-1">
          <p className="font-medium text-sm">
            {t("composer.firstCommentTitle")}
          </p>
          <Textarea
            aria-label={t("composer.firstCommentTitle")}
            disabled={disabled}
            onChange={(event) => emit({ firstComment: event.target.value })}
            placeholder={t("composer.firstCommentPlaceholder")}
            rows={2}
            value={firstComment}
          />
          <div className="flex items-start justify-between gap-2">
            <ul className="space-y-0.5 text-destructive text-xs">
              {issues
                .filter((issue) => issue.field === "firstComment.text")
                .map((issue) => (
                  <li key={issue.code}>{issueMessages[issue.code]}</li>
                ))}
            </ul>
            {rule.maxPartChars === null ? null : (
              <PartCounter
                max={rule.maxPartChars}
                provider={provider}
                value={firstComment}
              />
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
