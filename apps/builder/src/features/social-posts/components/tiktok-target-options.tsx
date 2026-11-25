"use client"

import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { useQuery } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { orpc } from "@/lib/orpc/query"
import type {
  ComposerContentTypeRule,
  ComposerOptions,
} from "../lib/composer-state"

/** TikTok's own pages the consent line must link to (content sharing guidelines). */
const MUSIC_USAGE_URL =
  "https://www.tiktok.com/legal/page/global/music-usage-confirmation/en"
const BRANDED_CONTENT_URL =
  "https://www.tiktok.com/legal/page/global/bc-policy/en"
const PRIVATE_LEVEL = "SELF_ONLY"

type InteractionKey = "allowComment" | "allowDuet" | "allowStitch"

/**
 * The disclosure TikTok's content sharing guidelines require before a post is
 * sent: the creator's nickname, a privacy choice with no default limited to the
 * creator's own options, interaction switches that start off (and stay off when
 * the creator disabled them), the commercial content disclosure, and the
 * consent line before the publish button. The creator info is read live each
 * time the card opens.
 */
export const TikTokTargetOptions = ({
  destinationId,
  disabled,
  onChange,
  options,
  privacyField,
  workspaceId,
}: {
  destinationId: string
  disabled: boolean
  onChange: (options: ComposerOptions) => void
  options: ComposerOptions
  privacyField: ComposerContentTypeRule["optionFields"][number] | undefined
  workspaceId: string
}) => {
  const t = useTranslations()
  const settings = useQuery({
    ...orpc.publishDestinationsAPIs.privateGetPublishingSettingsAPI.queryOptions(
      { input: { id: destinationId, workspaceId } },
    ),
    refetchOnMount: "always",
    staleTime: 0,
  })

  if (settings.isPending) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("composer.tiktokLoading")}
      </p>
    )
  }
  if (settings.isError) {
    return (
      <p className="text-destructive text-sm">
        {t("composer.tiktokUnavailable")}
      </p>
    )
  }
  const creator = settings.data
  const set = (changes: ComposerOptions) => onChange({ ...options, ...changes })
  const privacy =
    typeof options.privacyLevel === "string" ? options.privacyLevel : ""
  const commercial = options.commercialContent === true
  const yourBrand = options.brandOrganic === true
  const branded = options.brandContent === true
  const choices = (privacyField?.choices ?? []).filter((choice) =>
    creator.privacyLevelOptions.includes(choice.value),
  )
  const interactions: {
    disabled: boolean
    key: InteractionKey
    label: string
  }[] = [
    {
      disabled: creator.commentDisabled,
      key: "allowComment",
      label: t("composer.options.allowComment"),
    },
    {
      disabled: creator.duetDisabled,
      key: "allowDuet",
      label: t("composer.options.allowDuet"),
    },
    {
      disabled: creator.stitchDisabled,
      key: "allowStitch",
      label: t("composer.options.allowStitch"),
    },
  ]
  const consentLinks = {
    branded: (chunks: React.ReactNode) => (
      <a
        className="underline"
        href={BRANDED_CONTENT_URL}
        rel="noreferrer"
        target="_blank"
      >
        {chunks}
      </a>
    ),
    music: (chunks: React.ReactNode) => (
      <a
        className="underline"
        href={MUSIC_USAGE_URL}
        rel="noreferrer"
        target="_blank"
      >
        {chunks}
      </a>
    ),
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <p className="font-medium text-sm">
        {t("composer.tiktokCreator", {
          nickname: creator.creatorNickname ?? "",
        })}
      </p>
      {creator.canPostNow ? null : (
        <p className="text-destructive text-sm" role="alert">
          {t("composer.tiktokCannotPost")}
        </p>
      )}

      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">
          {t("composer.options.privacyLevel")}
        </p>
        <Select
          disabled={disabled || !creator.canPostNow}
          onValueChange={(value) =>
            typeof value === "string" && set({ privacyLevel: value })
          }
          value={privacy || null}
        >
          <SelectTrigger
            aria-label={t("composer.options.privacyLevel")}
            className="w-full"
          >
            <SelectValue placeholder={t("composer.tiktokPrivacyPlaceholder")}>
              {privacy ? t(`composer.tiktokPrivacy.${privacy}`) : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {choices.map((choice) => (
              <SelectItem
                disabled={branded && choice.value === PRIVATE_LEVEL}
                key={choice.value}
                title={
                  branded && choice.value === PRIVATE_LEVEL
                    ? t("composer.tiktokBrandedNotPrivate")
                    : undefined
                }
                value={choice.value}
              >
                {t(choice.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <fieldset className="space-y-1">
        <legend className="text-muted-foreground text-xs">
          {t("composer.tiktokInteractions")}
        </legend>
        <div className="flex flex-wrap gap-4">
          {interactions.map((interaction) => (
            // biome-ignore lint/a11y/noLabelWithoutControl: the Checkbox renders the control
            <label
              className="flex items-center gap-2 text-sm"
              key={interaction.key}
              title={
                interaction.disabled
                  ? t("composer.tiktokInteractionDisabled")
                  : undefined
              }
            >
              <Checkbox
                checked={
                  !interaction.disabled && options[interaction.key] === true
                }
                disabled={disabled || interaction.disabled}
                onCheckedChange={(checked) =>
                  set({ [interaction.key]: checked === true })
                }
              />
              {interaction.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        {/* biome-ignore lint/a11y/noLabelWithoutControl: the Switch renders the control */}
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={commercial}
            disabled={disabled}
            onCheckedChange={(checked) =>
              set(
                checked
                  ? { commercialContent: true }
                  : {
                      brandContent: false,
                      brandOrganic: false,
                      commercialContent: false,
                    },
              )
            }
          />
          {t("composer.options.commercialContent")}
        </label>
        {commercial ? (
          <div className="space-y-2 ps-6">
            <div className="flex flex-wrap gap-4">
              {/* biome-ignore lint/a11y/noLabelWithoutControl: the Checkbox renders the control */}
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={yourBrand}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    set({ brandOrganic: checked === true })
                  }
                />
                {t("composer.tiktokYourBrand")}
              </label>
              {/* biome-ignore lint/a11y/noLabelWithoutControl: the Checkbox renders the control */}
              <label
                className="flex items-center gap-2 text-sm"
                title={
                  privacy === PRIVATE_LEVEL
                    ? t("composer.tiktokBrandedNotPrivate")
                    : undefined
                }
              >
                <Checkbox
                  checked={branded}
                  disabled={disabled || privacy === PRIVATE_LEVEL}
                  onCheckedChange={(checked) =>
                    set({ brandContent: checked === true })
                  }
                />
                {t("composer.tiktokBrandedContent")}
              </label>
            </div>
            {yourBrand || branded ? (
              <p className="text-muted-foreground text-xs">
                {branded
                  ? t("composer.tiktokLabelPaid")
                  : t("composer.tiktokLabelPromotional")}
              </p>
            ) : (
              <p className="text-destructive text-xs">
                {t("composer.tiktokCommercialRequired")}
              </p>
            )}
          </div>
        ) : null}
      </div>

      {/* biome-ignore lint/a11y/noLabelWithoutControl: the Switch renders the control */}
      <label className="flex items-center gap-2 text-sm">
        <Switch
          checked={options.isAigc === true}
          disabled={disabled}
          onCheckedChange={(checked) => set({ isAigc: checked })}
        />
        {t("composer.options.isAigc")}
      </label>

      {creator.maxVideoPostDurationSec === null ? null : (
        <p className="text-muted-foreground text-xs">
          {t("composer.tiktokMaxDuration", {
            seconds: creator.maxVideoPostDurationSec,
          })}
        </p>
      )}
      <p className="text-muted-foreground text-xs">
        {branded
          ? t.rich("composer.tiktokConsentBranded", consentLinks)
          : t.rich("composer.tiktokConsentMusic", consentLinks)}
      </p>
      <p className="text-muted-foreground text-xs">
        {t("composer.tiktokProcessingNote")}
      </p>
    </div>
  )
}
