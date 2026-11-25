"use client"

import type { SocialProvider } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { AlertTriangleIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { CharacterCounter } from "@/components/character-counter"
import { ProviderAvatar } from "@/features/social-accounts/components/provider-avatar"
import {
  useContentTypeLabels,
  useIssueMessages,
} from "../hooks/use-composer-labels"
import {
  type ComposerContentTypeRule,
  type ComposerIssue,
  type ComposerOptions,
  type ComposerPreviewItem,
  type ComposerTarget,
  PROVIDER_LABELS,
} from "../lib/composer-state"
import { type ComposerPartsRule, PartsEditor } from "./parts-editor"
import { TargetMediaOverride } from "./target-media-override"
import { TargetScheduleField } from "./target-schedule-field"
import { TikTokTargetOptions } from "./tiktok-target-options"

/** What the card shows about the destination it publishes to. */
export type TargetDestination = {
  avatar: string | null
  name: string
  provider: SocialProvider
  /** The TikTok publishing login; `null` for the inbox networks. */
  socialAccountId: string | null
  /** Instagram only: connected through a Facebook Page. */
  viaFacebook: boolean
}

type OptionField = ComposerContentTypeRule["optionFields"][number]

/**
 * One setting generated from a registry field descriptor. The network and
 * content type decide which fields exist; this renderer knows none of them.
 * A `select` offers the descriptor's `choices`.
 */
const OptionControl = ({
  disabled,
  field,
  onChange,
  value,
}: {
  disabled: boolean
  field: OptionField
  onChange: (value: ComposerOptions[string]) => void
  value: ComposerOptions[string] | undefined
}) => {
  const t = useTranslations()
  const label = t(field.labelKey)

  if (field.control === "switch") {
    return (
      // biome-ignore lint/a11y/noLabelWithoutControl: the Switch renders the control
      <label className="flex items-center gap-2 text-sm">
        <Switch
          checked={value === true}
          disabled={disabled}
          onCheckedChange={onChange}
        />
        {label}
      </label>
    )
  }
  if (field.control === "select" && field.choices) {
    const selected = typeof value === "string" ? value : null
    return (
      <Select
        disabled={disabled}
        onValueChange={(next) => typeof next === "string" && onChange(next)}
        value={selected}
      >
        <SelectTrigger aria-label={label} className="w-full">
          <SelectValue placeholder={label}>
            {field.choices.find((choice) => choice.value === selected)
              ? t(
                  field.choices.find((choice) => choice.value === selected)
                    ?.labelKey ?? "",
                )
              : undefined}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {field.choices.map((choice) => (
            <SelectItem key={choice.value} value={choice.value}>
              {t(choice.labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }
  if (field.control === "number") {
    return (
      <Input
        aria-label={label}
        disabled={disabled}
        inputMode="numeric"
        min={0}
        onChange={(event) => {
          const parsed = Number.parseInt(event.target.value, 10)
          onChange(Number.isNaN(parsed) ? 0 : parsed)
        }}
        placeholder={label}
        type="number"
        value={typeof value === "number" ? value : 0}
      />
    )
  }
  return (
    <Input
      aria-label={label}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      placeholder={label}
      value={typeof value === "string" ? value : ""}
    />
  )
}

export const TargetCard = ({
  destination,
  disabled,
  hasLink,
  issues,
  onChange,
  onRemove,
  partsRule,
  preview,
  rules,
  target,
  timezone,
  workspaceId,
}: {
  destination: TargetDestination
  disabled: boolean
  /** The post has a valid shared link. */
  hasLink: boolean
  issues: ComposerIssue[]
  onChange: (changes: Partial<ComposerTarget>) => void
  onRemove: () => void
  /** Follow-up parts the network offers; `null` hides the editor. */
  partsRule: ComposerPartsRule | null
  preview: ComposerPreviewItem | undefined
  /** The content types this destination's network offers. */
  rules: ComposerContentTypeRule[]
  target: ComposerTarget
  /** The workspace's time zone, which the destination's own time is read in. */
  timezone: string
  workspaceId: string
}) => {
  const t = useTranslations()
  const issueMessages = useIssueMessages()
  const contentTypeLabels = useContentTypeLabels()
  const effectiveType = target.contentType ?? preview?.contentType ?? null
  const optionFields = (
    rules.find((rule) => rule.contentType === effectiveType)?.optionFields ?? []
  )
    .slice()
    .sort((a, b) => a.order - b.order)
  const effectiveRule = rules.find((rule) => rule.contentType === effectiveType)
  // A type with a text but no link field puts the link at the end of the caption.
  const linkInCaption =
    hasLink &&
    effectiveRule !== undefined &&
    !effectiveRule.supportsLink &&
    effectiveRule.text.maxLength !== 0

  return (
    <li
      className={cn(
        "space-y-3 rounded-xl border bg-card p-3",
        issues.length > 0 && "border-destructive/50",
      )}
    >
      <div className="flex items-center gap-2">
        <ProviderAvatar
          avatar={destination.avatar}
          className="size-7"
          provider={destination.provider}
        />
        <p className="min-w-0 flex-1 truncate font-medium text-sm">
          {PROVIDER_LABELS[destination.provider]} · {destination.name}
          {destination.viaFacebook ? (
            <span className="ms-2 rounded bg-muted px-1.5 py-0.5 font-normal text-muted-foreground text-xs">
              {t("composer.viaFacebook")}
            </span>
          ) : null}
        </p>
        {preview?.maxCharacters != null && !target.customised ? (
          <span className="text-muted-foreground text-xs tabular-nums">
            {preview.charactersUsed}/{preview.maxCharacters}
          </span>
        ) : null}
        <Button
          aria-label={t("composer.removeDestination")}
          disabled={disabled}
          onClick={onRemove}
          size="icon"
          type="button"
          variant="ghost"
        >
          <XIcon />
        </Button>
      </div>

      {destination.provider === "tiktok" && destination.socialAccountId ? (
        <TikTokTargetOptions
          destinationId={target.destinationId}
          disabled={disabled}
          onChange={(options) => onChange({ options })}
          options={{ ...preview?.options, ...target.options }}
          privacyField={optionFields.find(
            (field) => field.key === "privacyLevel",
          )}
          workspaceId={workspaceId}
        />
      ) : null}

      {/* biome-ignore lint/a11y/noLabelWithoutControl: the Switch renders the control */}
      <label className="flex items-center gap-2 text-sm">
        <Switch
          checked={target.customised}
          disabled={disabled}
          onCheckedChange={(customised) =>
            onChange({
              contentType: customised ? effectiveType : null,
              customised,
              // The channel's own files go with the customisation.
              media: customised ? target.media : null,
              // TikTok's settings are always shown; the other networks' are
              // hidden with the customisation, so they are dropped with it.
              options:
                customised || destination.provider === "tiktok"
                  ? target.options
                  : {},
            })
          }
        />
        {target.customised
          ? t("composer.customise")
          : t("composer.usesSharedContent")}
      </label>

      {target.customised ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <Textarea
              aria-label={t("composer.channelText")}
              disabled={disabled}
              onChange={(event) => onChange({ text: event.target.value })}
              placeholder={t("composer.channelTextPlaceholder")}
              rows={4}
              value={target.text}
            />
            {preview?.maxCharacters == null ? null : (
              <div className="flex justify-end">
                <CharacterCounter
                  max={preview.maxCharacters}
                  value={target.text || preview.text}
                />
              </div>
            )}
          </div>
          {rules.length > 1 && effectiveType ? (
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">
                {t("composer.contentType")}
              </p>
              <Select
                disabled={disabled}
                onValueChange={(value) => {
                  const next = rules.find((rule) => rule.contentType === value)
                  onChange({
                    contentType: next?.contentType ?? null,
                    options: {},
                  })
                }}
                value={effectiveType}
              >
                <SelectTrigger
                  aria-label={t("composer.contentType")}
                  className="w-full"
                >
                  <SelectValue>{contentTypeLabels[effectiveType]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {rules.map((rule) => (
                    <SelectItem key={rule.contentType} value={rule.contentType}>
                      {contentTypeLabels[rule.contentType]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <TargetMediaOverride
            disabled={disabled}
            maxMedia={effectiveRule?.maxMedia}
            media={target.media}
            onChange={(media) => onChange({ media })}
            workspaceId={workspaceId}
          />
          {optionFields
            .filter(() => destination.provider !== "tiktok")
            .map((field) => (
              <OptionControl
                disabled={disabled}
                field={field}
                key={field.key}
                onChange={(value) =>
                  onChange({
                    options: { ...target.options, [field.key]: value },
                  })
                }
                value={target.options[field.key] ?? preview?.options[field.key]}
              />
            ))}
        </div>
      ) : null}

      <TargetScheduleField
        disabled={disabled}
        onChange={(scheduledAt) => onChange({ scheduledAt })}
        timezone={timezone}
        value={target.scheduledAt}
      />

      {partsRule ? (
        <PartsEditor
          disabled={disabled}
          firstComment={target.firstComment}
          issues={issues}
          onChange={onChange}
          parts={target.parts}
          provider={destination.provider}
          rule={partsRule}
        />
      ) : null}

      {linkInCaption ? (
        <p className="text-muted-foreground text-xs">
          {t("composer.linkInCaption")}
        </p>
      ) : null}

      {issues.filter((issue) => issue.partIndex === undefined).length > 0 ? (
        <ul className="space-y-1">
          {issues
            .filter((issue) => issue.partIndex === undefined)
            .map((issue) => (
              <li
                className="flex items-start gap-2 text-destructive text-sm"
                key={`${issue.code}-${issue.field}`}
              >
                <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
                {issueMessages[issue.code]}
              </li>
            ))}
        </ul>
      ) : null}
    </li>
  )
}
