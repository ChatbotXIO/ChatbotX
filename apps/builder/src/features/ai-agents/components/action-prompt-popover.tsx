"use client"

import { DEFAULT_AI_AGENT_ACTION_PROMPT } from "@chatbotx.io/database/partials"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { InfoIcon, SlidersHorizontalIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFormContext } from "react-hook-form"
import type { CreateAIAgentRequest } from "../schema/action"

/** Keeps optional private matching instructions out of the rule editor. */
export function ActionPromptPopover() {
  const t = useTranslations("aiAgentActions")
  const { setValue } = useFormContext<CreateAIAgentRequest>()

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            aria-label={t("actionPrompt.open")}
            size="icon"
            type="button"
            variant="ghost"
          >
            <SlidersHorizontalIcon aria-hidden className="size-4" />
          </Button>
        }
      />
      <PopoverContent
        align="end"
        className="w-[min(36rem,calc(100vw-2rem))] gap-3 p-4"
        side="bottom"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1 font-medium text-sm">
            {t("actionPrompt.label")}
            <Tooltip>
              <TooltipTrigger
                render={
                  <InfoIcon
                    aria-label={t("actionPrompt.description")}
                    className="size-3.5 cursor-help text-muted-foreground"
                  />
                }
              />
              <TooltipContent className="max-w-sm">
                {t("actionPrompt.description")}
              </TooltipContent>
            </Tooltip>
          </div>
          <Button
            onClick={() =>
              setValue("actionPrompt", DEFAULT_AI_AGENT_ACTION_PROMPT, {
                shouldDirty: true,
                shouldTouch: true,
                shouldValidate: true,
              })
            }
            size="sm"
            type="button"
            variant="link"
          >
            {t("actionPrompt.reset")}
          </Button>
        </div>
        <TextareaField
          className="min-h-72 resize-y"
          name="actionPrompt"
          placeholder={t("actionPrompt.placeholder")}
        />
      </PopoverContent>
    </Popover>
  )
}
