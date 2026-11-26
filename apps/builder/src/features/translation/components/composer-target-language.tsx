"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { LanguagesIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useId, useMemo } from "react"
import { toast } from "sonner"
import { useChatStore } from "@/features/chat/store/chat-store-provider"
import { useWorkspaceId } from "@/hooks/routing"
import { updateConversationTranslationStateAction } from "../actions/update-conversation-state.action"
import { useConversationTranslation } from "../hooks/use-conversation-translation"
import { useInvalidateTranslation } from "../hooks/use-translation-settings"
import type { ComposerTranslationState } from "../lib/composer-translation"
import {
  readConversationTranslation,
  withConversationTranslation,
} from "../lib/conversation-translation"
import {
  COMMON_LANGUAGE_CODES,
  languageBadge,
  languageLabel,
} from "../lib/language-label"
import { useTranslationUiStore } from "../store/translation-ui-store"

/**
 * The chip next to the channel icon: which language the next message is
 * translated into (or why it is not translated). Its popover is the
 * conversation's "Translation settings": the on/off switch, the customer's
 * language, and the display options (original text, review before sending).
 */
export function ComposerTargetLanguage(props: {
  conversation: { id: string; additionalAttributes?: unknown }
  state: ComposerTranslationState
  previewEnabled: boolean
  onPreviewEnabledChange: (enabled: boolean) => void
  /** Hidden where nothing can be sent (the messaging window is closed). */
  showPreviewOption?: boolean
}) {
  const {
    conversation,
    state,
    previewEnabled,
    onPreviewEnabledChange,
    showPreviewOption = true,
  } = props
  const t = useTranslations("inboxTranslation.composer")
  const panel = useTranslations("inboxTranslation.panel")
  const locale = useLocale()
  const workspaceId = useWorkspaceId()
  const updateConversation = useChatStore((state) => state.updateConversation)
  const invalidate = useInvalidateTranslation()
  const previewId = useId()
  const enabledId = useId()
  const originalsId = useId()
  const showOriginals = useTranslationUiStore(
    (store) => store.showAllOriginals[conversation.id] ?? false,
  )
  const setShowAllOriginals = useTranslationUiStore(
    (store) => store.setShowAllOriginals,
  )
  const { botActive, botOnDuty, turnedOn, turnedOff } =
    useConversationTranslation()

  const { execute, isExecuting: isSaving } = useAction(
    updateConversationTranslationStateAction.bind(
      null,
      workspaceId,
      conversation.id,
    ),
    {
      onSuccess: ({ input }) => {
        const current = readConversationTranslation(conversation)
        updateConversation(conversation.id, {
          additionalAttributes: withConversationTranslation(
            conversation.additionalAttributes,
            {
              language: input.language ?? current.language ?? undefined,
              languageSource: input.language
                ? "manual"
                : (current.languageSource ?? undefined),
              ...(typeof input.enabledOverride === "boolean"
                ? { enabledOverride: input.enabledOverride }
                : {}),
            },
          ),
        })
        invalidate()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const options = useMemo(
    () =>
      COMMON_LANGUAGE_CODES.map((code) => ({
        value: code,
        label: languageLabel(code, locale),
      })),
    [locale],
  )

  if (state.kind === "hidden") {
    return null
  }

  const language = "language" in state ? state.language : null
  const label = chipLabel(state, t, languageBadge)
  const isTranslating = state.kind === "active"
  const isOff = state.kind === "off"
  // Off by default while the bot is on duty (see `isConversationTranslationOn`);
  // either way the switch saves the agent's choice for the conversation.
  const botHoldsBack = botOnDuty && !turnedOn && !turnedOff
  const onToggle = (on: boolean) => {
    execute({ enabledOverride: on })
  }
  // Base UI's checkbox is a span, so `disabled:` never applies: grey a checked
  // box out by hand while the conversation's translation is off.
  const disabledChecked =
    "data-checked:border-muted-foreground/40 data-checked:bg-muted-foreground/40 dark:data-checked:bg-muted-foreground/40 data-disabled:cursor-not-allowed"

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            aria-label={t("chip.aria")}
            className={
              isTranslating ? "gap-1 px-2" : "gap-1 px-2 text-muted-foreground"
            }
            size="sm"
            type="button"
            variant="ghost"
          >
            <LanguagesIcon aria-hidden className="size-4" />
            <span className="text-xs">{label}</span>
          </Button>
        }
      />
      <PopoverContent className="w-80 gap-0 p-0" side="top">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <LanguagesIcon aria-hidden className="size-4" />
          <p className="flex-1 font-semibold text-sm">{panel("title")}</p>
          <Badge
            className={
              isOff
                ? "border-transparent bg-muted text-muted-foreground"
                : "border-transparent bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
            }
          >
            {isOff ? panel("statusOff") : panel("statusOn")}
          </Badge>
        </div>
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <label className="min-w-0 flex-1 space-y-0.5" htmlFor={enabledId}>
            <span className="block font-medium text-sm">
              {panel("translateConversation")}
            </span>
            <span className="block text-muted-foreground text-xs">
              {botHoldsBack
                ? panel(botActive ? "botActiveHint" : "botPausedHint")
                : panel("translateConversationHint")}
            </span>
          </label>
          <Checkbox
            checked={!isOff}
            className="size-5 rounded-full"
            disabled={isSaving}
            id={enabledId}
            onCheckedChange={(checked) => onToggle(checked === true)}
          />
        </div>
        <div className="space-y-1.5 border-b px-4 py-3">
          <p className="font-medium text-muted-foreground text-sm">
            {t("popover.customerLanguage")}
          </p>
          <Select
            disabled={isOff}
            items={options}
            onValueChange={(value) => execute({ language: String(value) })}
            value={language}
          >
            <SelectTrigger className="h-9 w-full">
              <SelectValue placeholder={t("popover.chooseLanguage")} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2.5 px-4 py-3">
          <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
            {panel("displayOptions")}
          </p>
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={showOriginals}
              className={cn(isOff && disabledChecked)}
              disabled={isOff}
              id={originalsId}
              onCheckedChange={(checked) =>
                setShowAllOriginals(conversation.id, checked === true)
              }
            />
            <label htmlFor={originalsId}>{panel("showOriginals")}</label>
          </div>
          {showPreviewOption && (
            <div className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={previewEnabled}
                className={cn(isOff && disabledChecked)}
                disabled={isOff}
                id={previewId}
                onCheckedChange={(checked) =>
                  onPreviewEnabledChange(checked === true)
                }
              />
              <label htmlFor={previewId}>{panel("previewBeforeSending")}</label>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function chipLabel(
  state: ComposerTranslationState,
  t: ReturnType<typeof useTranslations>,
  badge: (code: string) => string,
): string {
  switch (state.kind) {
    case "active":
      return t("chip.target", { language: badge(state.language) })
    case "sameLanguage":
      return t("chip.sameLanguage")
    case "unknownLanguage":
      return t("chip.unknown")
    case "hasFiles":
      return t("chip.hasFiles")
    case "off":
      return t("chip.off")
    default:
      return ""
  }
}
