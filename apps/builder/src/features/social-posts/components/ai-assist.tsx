"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import type { SocialProvider } from "@chatbotx.io/utils/social-account"
import { ORPCError } from "@orpc/client"
import { useMutation } from "@tanstack/react-query"
import { Loader2Icon, SparklesIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { z } from "zod"
import {
  defaultWritingToggles,
  type WritingToggles,
} from "@/features/social-posts-ai/lib/writing-defaults"
import {
  MAX_CTA_CHARS,
  readWritingPreferences,
  saveWritingPreferences,
  VARIANT_COUNTS,
  type VariantCount,
  type WritingPreferences,
} from "@/features/social-posts-ai/lib/writing-preferences"
import type { AiModelChoice } from "@/features/social-posts-ai/model-choice"
import type { generatePostTextFields } from "@/features/social-posts-ai/schema"
import { orpc } from "@/lib/orpc/query"
import {
  AI_MODES,
  AI_TONES,
  type AiMode,
  type AiTone,
  useAiErrorMessage,
  useAiModeLabels,
  useAiToneLabels,
} from "../hooks/use-ai-assist-labels"
import { AiAssistResults, type AiSuggestion } from "./ai-assist-results"
import { AiModelPicker } from "./ai-model-picker"

type AiRequest = z.input<typeof generatePostTextFields>

const FIELD_CLASS =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"

const codeOf = (error: Error): string =>
  error instanceof ORPCError ? error.code : ""

/**
 * "Write with AI": a prompt, a mode, a suggestion to read. The suggestion is
 * only ever applied by a click on Insert or Replace; the call itself saves and
 * publishes nothing, and a fresh idempotency key per click makes a double click
 * or a retry cost one model call.
 */
export const AiAssist = ({
  destinationIds,
  disabled,
  onApplyToNetworks,
  onHashtag,
  onInsert,
  onReplace,
  postText,
  providers,
  workspaceId,
}: {
  destinationIds: string[]
  disabled: boolean
  /** Writes each per-network version into that network's targets. */
  onApplyToNetworks: (
    versions: { provider: SocialProvider; text: string }[],
  ) => void
  onHashtag: (tag: string) => void
  onInsert: (text: string) => void
  onReplace: (text: string) => void
  postText: string
  /** The networks of the selected destinations, without duplicates. */
  providers: SocialProvider[]
  workspaceId: string
}) => {
  const t = useTranslations()
  const modeLabels = useAiModeLabels()
  const toneLabels = useAiToneLabels()
  const errorMessage = useAiErrorMessage()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<AiMode>("write")
  const [tone, setTone] = useState<AiTone>("friendly")
  const [brief, setBrief] = useState("")
  const [suggestion, setSuggestion] = useState<AiSuggestion | null>(null)
  const [choice, setChoice] = useState<AiModelChoice | null>(null)
  const [preferences, setPreferences] = useState<WritingPreferences>({})
  // Read after mount: the server render has no storage.
  useEffect(() => {
    setPreferences(readWritingPreferences(workspaceId))
  }, [workspaceId])
  const toggles: WritingToggles = {
    ...defaultWritingToggles(providers),
    ...savedToggles(preferences),
  }
  const variants: VariantCount = preferences.variants ?? 1
  const ctaText = preferences.callToActionText ?? ""
  const canWritePerNetwork = providers.length >= 2 && mode !== "hashtags"
  const perNetwork = canWritePerNetwork && Boolean(preferences.perNetwork)
  const styled = mode !== "hashtags"
  const remember = (changes: Partial<WritingPreferences>) => {
    const next = { ...preferences, ...changes }
    setPreferences(next)
    saveWritingPreferences(workspaceId, next)
  }

  const generate = useMutation(
    orpc.socialPostsAiAPIs.privateGeneratePostTextAPI.mutationOptions({
      onError: (error) => toast.error(errorMessage(codeOf(error))),
      onSuccess: setSuggestion,
    }),
  )

  const usesPostText = mode !== "write"
  const needsDestination = mode === "fit" && destinationIds.length === 0
  const missingInput = usesPostText ? !postText.trim() : !brief.trim()
  const hint = (() => {
    if (needsDestination) {
      return t("composer.aiFitNeedsDestination")
    }
    return usesPostText && !postText.trim()
      ? t("composer.aiNeedsPostText")
      : null
  })()

  const run = () => {
    const request: AiRequest = {
      brief: usesPostText ? undefined : brief.trim(),
      callToAction: styled ? toggles.callToAction : undefined,
      callToActionText:
        styled && toggles.callToAction && ctaText.trim()
          ? ctaText.trim()
          : undefined,
      destinationIds: destinationIds.length > 0 ? destinationIds : undefined,
      emoji: styled ? toggles.emoji : undefined,
      hashtags: styled ? toggles.hashtags : undefined,
      idempotencyKey: crypto.randomUUID(),
      integrationId: choice?.integrationId,
      mode,
      model: choice?.model,
      perNetwork: styled && perNetwork ? true : undefined,
      providers: providers.length > 0 ? providers : undefined,
      text: usesPostText ? postText.trim() : undefined,
      tone: mode === "tone" ? tone : undefined,
      variants: styled && !perNetwork ? variants : undefined,
    }
    setSuggestion(null)
    generate.mutate({ ...request, workspaceId })
  }
  const finish = () => {
    setSuggestion(null)
    setOpen(false)
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button disabled={disabled} size="sm" type="button" variant="outline">
            <SparklesIcon />
            {t("composer.aiAssist")}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-80 space-y-3 p-3">
        <p className="text-muted-foreground text-xs">
          {t("composer.aiPrivacy")}
        </p>
        <AiModelPicker onChange={setChoice} workspaceId={workspaceId} />
        <div className="space-y-1">
          <Label htmlFor="composer-ai-mode">{t("composer.aiMode")}</Label>
          <select
            className={FIELD_CLASS}
            id="composer-ai-mode"
            onChange={(event) => {
              setMode(event.target.value as AiMode)
              setSuggestion(null)
            }}
            value={mode}
          >
            {AI_MODES.map((item) => (
              <option key={item} value={item}>
                {modeLabels[item]}
              </option>
            ))}
          </select>
        </div>
        {mode === "tone" ? (
          <div className="space-y-1">
            <Label htmlFor="composer-ai-tone">{t("composer.aiTone")}</Label>
            <select
              className={FIELD_CLASS}
              id="composer-ai-tone"
              onChange={(event) => setTone(event.target.value as AiTone)}
              value={tone}
            >
              {AI_TONES.map((item) => (
                <option key={item} value={item}>
                  {toneLabels[item]}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {usesPostText ? (
          <p className="text-muted-foreground text-sm">
            {t("composer.aiUsesPostText")}
          </p>
        ) : (
          <div className="space-y-1">
            <Label htmlFor="composer-ai-brief">{t("composer.aiBrief")}</Label>
            <Textarea
              id="composer-ai-brief"
              maxLength={1000}
              onChange={(event) => setBrief(event.target.value)}
              placeholder={t("composer.aiBriefPlaceholder")}
              rows={3}
              value={brief}
            />
          </div>
        )}
        {styled ? (
          <AiStyleOptions
            ctaText={ctaText}
            onChange={remember}
            perNetwork={perNetwork}
            showPerNetwork={canWritePerNetwork}
            toggles={toggles}
            variants={variants}
          />
        ) : null}
        {hint ? (
          <p className="text-amber-700 text-sm dark:text-amber-400">{hint}</p>
        ) : null}
        <Button
          className="w-full"
          disabled={
            !choice || missingInput || needsDestination || generate.isPending
          }
          onClick={run}
          size="sm"
          type="button"
        >
          {generate.isPending ? <Loader2Icon className="animate-spin" /> : null}
          {generate.isPending
            ? t("composer.aiGenerating")
            : t("composer.aiGenerate")}
        </Button>
        {suggestion ? (
          <AiAssistResults
            onApplyToNetworks={(versions) => {
              onApplyToNetworks(
                versions.flatMap((version) =>
                  version.provider
                    ? [{ provider: version.provider, text: version.text }]
                    : [],
                ),
              )
              finish()
            }}
            onHashtag={onHashtag}
            onInsert={(text) => {
              onInsert(text)
              finish()
            }}
            onReplace={(text) => {
              onReplace(text)
              finish()
            }}
            postText={postText}
            suggestion={suggestion}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

const savedToggles = (
  preferences: WritingPreferences,
): Partial<WritingToggles> => ({
  ...(preferences.callToAction === undefined
    ? {}
    : { callToAction: preferences.callToAction }),
  ...(preferences.emoji === undefined ? {} : { emoji: preferences.emoji }),
  ...(preferences.hashtags === undefined
    ? {}
    : { hashtags: preferences.hashtags }),
})

const ToggleRow = ({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}) => (
  // biome-ignore lint/a11y/noLabelWithoutControl: the Switch renders the control
  <label className="flex items-center gap-2 text-sm">
    <Switch checked={checked} onCheckedChange={onChange} />
    {label}
  </label>
)

const AiStyleOptions = ({
  ctaText,
  onChange,
  perNetwork,
  showPerNetwork,
  toggles,
  variants,
}: {
  ctaText: string
  onChange: (changes: Partial<WritingPreferences>) => void
  perNetwork: boolean
  showPerNetwork: boolean
  toggles: WritingToggles
  variants: VariantCount
}) => {
  const t = useTranslations()
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <ToggleRow
          checked={toggles.hashtags}
          label={t("composer.aiHashtags")}
          onChange={(hashtags) => onChange({ hashtags })}
        />
        <ToggleRow
          checked={toggles.emoji}
          label={t("composer.aiEmoji")}
          onChange={(emoji) => onChange({ emoji })}
        />
        <ToggleRow
          checked={toggles.callToAction}
          label={t("composer.aiCallToAction")}
          onChange={(callToAction) => onChange({ callToAction })}
        />
      </div>
      {toggles.callToAction ? (
        <div className="space-y-1">
          <Label htmlFor="composer-ai-cta">
            {t("composer.aiCallToActionText")}
          </Label>
          <Input
            id="composer-ai-cta"
            maxLength={MAX_CTA_CHARS}
            onChange={(event) =>
              onChange({ callToActionText: event.target.value })
            }
            placeholder={t("composer.aiCallToActionPlaceholder")}
            value={ctaText}
          />
        </div>
      ) : null}
      {showPerNetwork ? (
        <div className="space-y-0.5">
          <ToggleRow
            checked={perNetwork}
            label={t("composer.aiPerNetwork")}
            onChange={(next) => onChange({ perNetwork: next })}
          />
          {perNetwork ? (
            <p className="text-muted-foreground text-xs">
              {t("composer.aiPerNetworkHint")}
            </p>
          ) : null}
        </div>
      ) : null}
      {perNetwork ? null : (
        <fieldset className="flex items-center gap-2">
          <legend className="sr-only">{t("composer.aiVariants")}</legend>
          <span aria-hidden className="text-sm">
            {t("composer.aiVariants")}
          </span>
          {VARIANT_COUNTS.map((count) => (
            <Button
              aria-pressed={variants === count}
              key={count}
              onClick={() => onChange({ variants: count })}
              size="sm"
              type="button"
              variant={variants === count ? "default" : "outline"}
            >
              {count}
            </Button>
          ))}
        </fieldset>
      )}
    </div>
  )
}
