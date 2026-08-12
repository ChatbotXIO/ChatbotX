"use client"

import type {
  AdsConversionRuleTrigger,
  AdsConversionRuleTriggerType,
} from "@chatbotx.io/business"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { MultiSelect } from "@chatbotx.io/ui/components/ui/sersavan/multi-select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { InfoIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { AutomatedResponseResource } from "@/features/automated-response/schema/resource"
import type { TagResource } from "@/features/tags/schema/resource"

export type TriggerOption = { label: string; value: string }

const defaultTriggerValueByType: Record<
  AdsConversionRuleTriggerType,
  AdsConversionRuleTrigger
> = {
  templateSent: { type: "templateSent", templateIds: [] },
  tagApplied: { type: "tagApplied", tagIds: [] },
  keywordMatched: { type: "keywordMatched", automatedResponseIds: [] },
  contactReplied: { type: "contactReplied", firstReplyOnly: false },
}

export function buildDefaultTrigger(
  type: AdsConversionRuleTriggerType,
): AdsConversionRuleTrigger {
  return defaultTriggerValueByType[type]
}

export function isTriggerComplete(trigger: AdsConversionRuleTrigger): boolean {
  switch (trigger.type) {
    case "templateSent":
      return trigger.templateIds.length > 0
    case "tagApplied":
      return trigger.tagIds.length > 0
    case "keywordMatched":
      return trigger.automatedResponseIds.length > 0
    case "contactReplied":
      return true
    default:
      return false
  }
}

function keywordRuleLabel(rule: AutomatedResponseResource, fallback: string) {
  return rule.keywords.length > 0 ? rule.keywords.join(", ") : fallback
}

type ConversionRuleTriggerPickerProps = {
  value: AdsConversionRuleTrigger
  onChange: (value: AdsConversionRuleTrigger) => void
  templateOptions: TriggerOption[]
  tags: TagResource[]
  automatedResponses: AutomatedResponseResource[]
  disabled?: boolean
}

export function ConversionRuleTriggerPicker({
  value,
  onChange,
  templateOptions,
  tags,
  automatedResponses,
  disabled,
}: ConversionRuleTriggerPickerProps) {
  const t = useTranslations()

  const tagOptions: TriggerOption[] = tags.map((tag) => ({
    label: tag.name,
    value: tag.id,
  }))
  const keywordOptions: TriggerOption[] = automatedResponses.map((rule) => ({
    label: keywordRuleLabel(
      rule,
      t("ads.conversionEvents.untitledKeywordRule"),
    ),
    value: rule.id,
  }))

  const whenItems: TriggerOption[] = [
    {
      label: t("ads.conversionEvents.whenOptions.templateSent"),
      value: "templateSent",
    },
    {
      label: t("ads.conversionEvents.whenOptions.tagApplied"),
      value: "tagApplied",
    },
    {
      label: t("ads.conversionEvents.whenOptions.keywordMatched"),
      value: "keywordMatched",
    },
    {
      label: t("ads.conversionEvents.whenOptions.contactReplied"),
      value: "contactReplied",
    },
  ]

  return (
    <>
      <div className="grid min-w-56 gap-2">
        <Label>{t("ads.conversionEvents.when")}</Label>
        <Select
          disabled={disabled}
          items={whenItems}
          onValueChange={(nextType) =>
            onChange(
              buildDefaultTrigger(nextType as AdsConversionRuleTriggerType),
            )
          }
          value={value.type}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {whenItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {value.type === "templateSent" && (
        <div className="grid min-w-72 flex-1 gap-2">
          <Label>{t("ads.conversionEvents.templates")}</Label>
          <MultiSelect
            className="min-h-9 w-full justify-between"
            defaultValue={value.templateIds}
            disabled={disabled || templateOptions.length === 0}
            emptyIndicator={t("ads.conversionEvents.noTemplates")}
            hideSelectAll
            maxCount={2}
            onValueChange={(templateIds) =>
              onChange({ type: "templateSent", templateIds })
            }
            options={templateOptions}
            placeholder={t("ads.conversionEvents.selectTemplates")}
          />
        </div>
      )}

      {value.type === "tagApplied" && (
        <div className="grid min-w-72 flex-1 gap-2">
          <Label>{t("ads.conversionEvents.tags")}</Label>
          <MultiSelect
            className="min-h-9 w-full justify-between"
            defaultValue={value.tagIds}
            disabled={disabled || tagOptions.length === 0}
            emptyIndicator={t("ads.conversionEvents.noTags")}
            hideSelectAll
            maxCount={2}
            onValueChange={(tagIds) => onChange({ type: "tagApplied", tagIds })}
            options={tagOptions}
            placeholder={t("ads.conversionEvents.selectTags")}
          />
        </div>
      )}

      {value.type === "keywordMatched" && (
        <div className="grid min-w-72 flex-1 gap-2">
          <Label>{t("ads.conversionEvents.keywordRules")}</Label>
          <MultiSelect
            className="min-h-9 w-full justify-between"
            defaultValue={value.automatedResponseIds}
            disabled={disabled || keywordOptions.length === 0}
            emptyIndicator={t("ads.conversionEvents.noKeywordRules")}
            hideSelectAll
            maxCount={2}
            onValueChange={(automatedResponseIds) =>
              onChange({ type: "keywordMatched", automatedResponseIds })
            }
            options={keywordOptions}
            placeholder={t("ads.conversionEvents.selectKeywordRules")}
          />
        </div>
      )}

      {value.type === "contactReplied" && (
        <div className="grid min-w-72 flex-1 gap-2">
          <div className="flex items-center gap-1.5">
            <Label>{t("ads.conversionEvents.replyOptions")}</Label>
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    aria-label={t("ads.conversionEvents.dedupeNote")}
                    className="inline-flex text-muted-foreground"
                    role="img"
                  >
                    <InfoIcon className="size-3.5" />
                  </span>
                }
              />
              <TooltipContent className="max-w-xs">
                {t("ads.conversionEvents.dedupeNote")}
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex min-h-9 items-center gap-2 text-sm">
            <Checkbox
              checked={value.firstReplyOnly}
              disabled={disabled}
              id="conversion-rule-first-reply-only"
              onCheckedChange={(checked) =>
                onChange({
                  type: "contactReplied",
                  firstReplyOnly: Boolean(checked),
                })
              }
            />
            <Label htmlFor="conversion-rule-first-reply-only">
              {t("ads.conversionEvents.firstReplyOnly")}
            </Label>
          </div>
        </div>
      )}
    </>
  )
}

export function describeTriggerLabel(
  t: ReturnType<typeof useTranslations>,
  trigger: AdsConversionRuleTrigger,
): string {
  switch (trigger.type) {
    case "templateSent":
      return t("ads.conversionEvents.qualifyingTemplateMessageSent")
    case "tagApplied":
      return t("ads.conversionEvents.whenOptions.tagApplied")
    case "keywordMatched":
      return t("ads.conversionEvents.whenOptions.keywordMatched")
    case "contactReplied":
      return trigger.firstReplyOnly
        ? t("ads.conversionEvents.qualifyingFirstReply")
        : t("ads.conversionEvents.qualifyingAnyReply")
    default:
      return ""
  }
}

export function describeTriggerDetail(
  t: ReturnType<typeof useTranslations>,
  trigger: AdsConversionRuleTrigger,
  data: {
    whatsappTemplates: { id: string; name: string }[]
    tags: TagResource[]
    automatedResponses: AutomatedResponseResource[]
  },
): string {
  switch (trigger.type) {
    case "templateSent":
      return trigger.templateIds
        .map(
          (templateId) =>
            data.whatsappTemplates.find(
              (template) => template.id === templateId,
            )?.name ?? templateId,
        )
        .join(", ")
    case "tagApplied":
      return trigger.tagIds
        .map(
          (tagId) => data.tags.find((tag) => tag.id === tagId)?.name ?? tagId,
        )
        .join(", ")
    case "keywordMatched":
      return trigger.automatedResponseIds
        .map((automatedResponseId) => {
          const rule = data.automatedResponses.find(
            (candidate) => candidate.id === automatedResponseId,
          )
          return rule
            ? keywordRuleLabel(
                rule,
                t("ads.conversionEvents.untitledKeywordRule"),
              )
            : automatedResponseId
        })
        .join(", ")
    case "contactReplied":
      return ""
    default:
      return ""
  }
}
