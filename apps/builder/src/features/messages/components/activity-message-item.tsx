"use client"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { format } from "date-fns"
import { useTranslations } from "next-intl"
import type { MessageResourceWithRelations } from "../schema/resource"

type ActivityContentAttributes = {
  activityType?:
    | "custom_field_changed"
    | "custom_field_cleared"
    | "tag_added"
    | "tag_removed"
    | "flow_triggered"
    | "sequence_subscribed"
    | "sequence_unsubscribed"
    | "conversation_status_changed"
  customFieldId?: string
  customFieldName?: string
  fieldKeyword?: string
  oldValue?: string | null
  newValue?: string
  tags?: string[]
  flowId?: string
  flowName?: string
  sequenceId?: string
  sequenceName?: string
  status?: string
}

export const ActivityMessageItem = ({
  message,
}: {
  message: MessageResourceWithRelations
}) => {
  const t = useTranslations("messages.activity")
  const attrs = (message.contentAttributes ?? {}) as ActivityContentAttributes
  const formattedTime = format(
    new Date(message.createdAt),
    "yyyy/MM/dd HH:mm:ss",
  )

  const renderContent = () => {
    switch (attrs.activityType) {
      case "custom_field_changed":
        return (
          <div className="flex flex-col items-center justify-center text-center">
            <div className="text-muted-foreground text-xs">
              {t("customFieldChanged", {
                name:
                  attrs.customFieldName ??
                  attrs.fieldKeyword ??
                  attrs.customFieldId ??
                  "",
              })}
            </div>
            <div className="mt-1 flex flex-col items-center justify-center text-muted-foreground text-xs">
              {attrs.oldValue === undefined ? null : (
                <div>
                  <span className="font-semibold text-foreground/85">
                    {t("previousValue")}:
                  </span>{" "}
                  <span>{attrs.oldValue || t("unset")}</span>
                </div>
              )}
              {attrs.newValue ? (
                <div>
                  <span className="font-semibold text-foreground/85">
                    {t("newValue")}:
                  </span>{" "}
                  <span>{attrs.newValue}</span>
                </div>
              ) : null}
            </div>
          </div>
        )

      case "custom_field_cleared":
        return (
          <div className="text-center text-muted-foreground text-xs">
            {t("customFieldCleared", {
              name: attrs.fieldKeyword ?? attrs.customFieldName ?? "",
            })}
          </div>
        )

      case "tag_added":
        return (
          <div className="text-center text-muted-foreground text-xs">
            <span>{t("tagAddedLabel")}: </span>
            <span className="font-medium text-foreground/90">
              {(attrs.tags ?? []).join(", ")}
            </span>
          </div>
        )

      case "tag_removed":
        return (
          <div className="text-center text-muted-foreground text-xs">
            <span>{t("tagRemovedLabel")}: </span>
            <span className="font-medium text-foreground/90 line-through opacity-75">
              {(attrs.tags ?? []).join(", ")}
            </span>
          </div>
        )

      case "flow_triggered": {
        const flowName = attrs.flowName ?? attrs.flowId ?? ""
        return (
          <div className="text-center text-muted-foreground text-xs">
            <span>{t("flowTriggeredPrefix")} </span>
            <span className="font-medium text-foreground/90 underline">
              {flowName}
            </span>
            <span> {t("flowTriggeredSuffix")}</span>
          </div>
        )
      }

      case "sequence_subscribed": {
        const seqName = attrs.sequenceName ?? attrs.sequenceId ?? ""
        return (
          <div className="text-center text-muted-foreground text-xs">
            <span>{t("sequenceSubscribedPrefix")} </span>
            <span className="font-medium text-foreground/90 underline">
              {seqName}
            </span>
          </div>
        )
      }

      case "sequence_unsubscribed": {
        const seqName = attrs.sequenceName ?? attrs.sequenceId ?? ""
        return (
          <div className="text-center text-muted-foreground text-xs">
            <span>{t("sequenceUnsubscribedPrefix")} </span>
            <span className="font-medium text-foreground/90 underline">
              {seqName}
            </span>
          </div>
        )
      }

      case "conversation_status_changed":
        return (
          <div className="text-center text-muted-foreground text-xs">
            {attrs.status === "closed"
              ? t("conversationClosed")
              : t("conversationReopened")}
          </div>
        )

      default: {
        const lines = (message.text ?? "").split("\n")
        return (
          <div className="flex flex-col items-center justify-center text-center text-muted-foreground text-xs">
            {lines.map((line, idx) => {
              const colonIdx = line.indexOf(":")
              const lower = line.toLowerCase()
              if (
                colonIdx !== -1 &&
                (lower.startsWith("previous value:") ||
                  lower.startsWith("valor anterior:") ||
                  lower.startsWith("new value:") ||
                  lower.startsWith("nuevo valor:"))
              ) {
                const label = line.slice(0, colonIdx + 1)
                const val = line.slice(colonIdx + 1)
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: lines are static text chunks
                  <div className="mt-0.5" key={idx}>
                    <span className="font-semibold text-foreground/85">
                      {label}
                    </span>
                    <span>{val}</span>
                  </div>
                )
              }
              return (
                <div
                  className={idx === 0 ? "text-muted-foreground" : ""}
                  // biome-ignore lint/suspicious/noArrayIndexKey: lines are static text chunks
                  key={idx}
                >
                  {line}
                </div>
              )
            })}
          </div>
        )
      }
    }
  }

  return (
    <div
      className="-mt-px flex w-full flex-col items-center justify-center border-border/70 border-y border-dashed px-4 py-3.5 text-center"
      data-slot="activity-message-item"
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <div className="flex w-full cursor-default flex-col items-center justify-center text-center">
              {renderContent()}
            </div>
          }
        />
        <TooltipContent>
          <p>{formattedTime}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
