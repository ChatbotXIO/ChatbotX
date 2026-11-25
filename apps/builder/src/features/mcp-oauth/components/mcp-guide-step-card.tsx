"use client"

import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { CopyIcon, ExternalLinkIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useClipboard } from "@/hooks/use-clipboard"
import type { McpGuideStep } from "../lib/connect-clients"

const ACTION_LABEL_KEYS = {
  addConnector: "guide.actions.addConnector",
  startChatting: "guide.actions.startChatting",
} as const

type McpGuideStepCardProps = {
  number: number
  step: McpGuideStep
}

const CopyField = ({ value }: { value: string }) => {
  const common = useTranslations()
  const { handleCopy } = useClipboard()
  const isMultiline = value.includes("\n")

  return (
    <div
      className={cn(
        "flex min-w-0 gap-2 rounded-lg border bg-background p-2 pl-3",
        isMultiline ? "items-start" : "items-center",
      )}
    >
      <code
        className={cn(
          "w-0 min-w-0 flex-1 font-mono text-xs leading-5",
          isMultiline && "py-2",
          isMultiline ? "max-h-40 overflow-auto whitespace-pre" : "break-all",
        )}
      >
        {value}
      </code>
      <Button
        aria-label={common("actions.copy")}
        className="shrink-0"
        onClick={() => handleCopy(value)}
        size="icon"
        type="button"
        variant="ghost"
      >
        <CopyIcon className="size-4" />
      </Button>
    </div>
  )
}

const StepAction = ({ step }: { step: McpGuideStep }) => {
  const t = useTranslations("chatbotxMcp")
  const { action } = step

  if (action.kind === "copy") {
    return <CopyField value={action.value} />
  }
  if (action.kind === "link") {
    const isPrimary = action.label === "startChatting"
    return (
      <a
        className={cn(
          buttonVariants({
            size: "lg",
            variant: isPrimary ? "default" : "outline",
          }),
          "h-auto min-h-10 w-full whitespace-normal py-2 text-center",
        )}
        href={action.href}
        rel="noopener noreferrer"
        target="_blank"
      >
        {t(ACTION_LABEL_KEYS[action.label])}
        <ExternalLinkIcon aria-hidden="true" className="size-4" />
        <span className="sr-only">{t("guide.opensInNewTab")}</span>
      </a>
    )
  }
  return null
}

export const McpGuideStepCard = ({ number, step }: McpGuideStepCardProps) => {
  const t = useTranslations("chatbotxMcp")

  return (
    <li className="flex min-w-0 flex-col gap-4 rounded-xl bg-muted/60 p-5">
      <span
        aria-hidden="true"
        className="flex size-8 items-center justify-center rounded-full border bg-background font-semibold text-sm shadow-xs"
      >
        {number}
      </span>
      <div className="flex-1 space-y-2">
        <h3 className="font-semibold text-base leading-snug">
          {t(step.titleKey)}
        </h3>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {t(step.bodyKey)}
        </p>
      </div>
      <StepAction step={step} />
    </li>
  )
}
