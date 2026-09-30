"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { InfoIcon, Loader2Icon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { type ReactNode, useState } from "react"
import { toast } from "sonner"
import { FlowSelectorSimple } from "@/features/sequences/components/flow-selector"
import { updateHandoverResumeFlowAction } from "../actions/update-handover-resume-flow.action"

type ConversationRoutingCardProps = {
  workspaceId: string
  integrationWhatsappId: string
  handoverResumeFlowId: string | null
  isSuperAdmin: boolean
}

/**
 * The disabled-control pattern used by `CallActionButton`: a disabled control
 * fires no pointer events, so the tooltip trigger is a wrapping span.
 */
const AdminOnly = ({
  isDisabled,
  tooltip,
  children,
}: {
  isDisabled: boolean
  tooltip: string
  children: ReactNode
}) => {
  if (!isDisabled) {
    return children
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span className="inline-flex w-full">{children}</span>}
      />
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

/**
 * WhatsApp number settings for conversation routing. Routing itself is set up
 * by the business in Meta Business Suite, so the only local setting is the flow
 * that runs when a partner hands a conversation back. The chosen flow is saved
 * explicitly with the button; the selection is editable until then.
 */
export function ConversationRoutingCard({
  workspaceId,
  integrationWhatsappId,
  handoverResumeFlowId,
  isSuperAdmin,
}: ConversationRoutingCardProps) {
  const t = useTranslations()
  // `confirmedFlowId` is what the server last accepted; `flowId` is the pending
  // edit shown in the selector until the admin saves it.
  const [confirmedFlowId, setConfirmedFlowId] = useState(handoverResumeFlowId)
  const [flowId, setFlowId] = useState(handoverResumeFlowId)

  const { execute, isExecuting } = useAction(
    updateHandoverResumeFlowAction.bind(
      null,
      workspaceId,
      integrationWhatsappId,
    ),
    {
      onSuccess: ({ data }) => {
        const saved = data?.handoverResumeFlowId ?? null
        setConfirmedFlowId(saved)
        setFlowId(saved)
        toast.success(t("messages.savedSuccessfully"))
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? t("messages.unknownError"))
      },
    },
  )

  const isDirty = flowId !== confirmedFlowId
  const isFieldDisabled = !isSuperAdmin || isExecuting

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("conversationRouting.settings.title")}</CardTitle>
        <CardDescription>
          {t("conversationRouting.settings.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="font-medium text-sm" id="handover-resume-flow">
            {t("conversationRouting.settings.resumeFlowLabel")}
          </span>
          <AdminOnly
            isDisabled={!isSuperAdmin}
            tooltip={t("conversationRouting.settings.adminOnly")}
          >
            <fieldset
              aria-labelledby="handover-resume-flow"
              className="flex w-full items-center gap-2"
              disabled={isFieldDisabled}
            >
              <div className="min-w-0 flex-1">
                <FlowSelectorSimple
                  className="w-full"
                  onChange={(value) => setFlowId(value || null)}
                  placeholder={t(
                    "conversationRouting.settings.resumeFlowPlaceholder",
                  )}
                  value={flowId ?? ""}
                />
              </div>
              {flowId && (
                <Button
                  aria-label={t("conversationRouting.settings.clearFlow")}
                  onClick={() => setFlowId(null)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <XIcon aria-hidden />
                </Button>
              )}
            </fieldset>
          </AdminOnly>
        </div>
        <p className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-muted-foreground text-sm">
          <InfoIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{t("conversationRouting.settings.info")}</span>
        </p>
        <div className="flex justify-end">
          <AdminOnly
            isDisabled={!isSuperAdmin}
            tooltip={t("conversationRouting.settings.adminOnly")}
          >
            <Button
              disabled={isFieldDisabled || !isDirty}
              onClick={() => execute({ handoverResumeFlowId: flowId })}
              type="button"
            >
              {isExecuting && (
                <Loader2Icon aria-hidden className="size-4 animate-spin" />
              )}
              {t("conversationRouting.settings.save")}
            </Button>
          </AdminOnly>
        </div>
      </CardContent>
    </Card>
  )
}
