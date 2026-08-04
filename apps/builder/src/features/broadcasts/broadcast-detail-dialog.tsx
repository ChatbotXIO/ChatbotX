"use client"

import type { BroadcastTemplateDetail } from "@chatbotx.io/business"
import {
  broadcastSubactions,
  channelTypes,
} from "@chatbotx.io/database/partials"
import type {
  MessengerTemplateComponent,
  MessengerTemplateParams,
  TemplateComponent,
  WaTemplateParams,
} from "@chatbotx.io/flow-config"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { format } from "date-fns"
import { useFormatter, useTranslations } from "next-intl"
import { type ReactNode, useEffect, useMemo, useState } from "react"
import { ContactFilterSummary } from "@/features/contact-filter/components/contact-filter-summary"
import { contactFilterCriteriaSchema } from "@/features/contact-filter/schemas"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"
import { MessengerTemplatePreview } from "@/features/integration-messenger/message-templates/components/template-preview"
import { TemplatePreview } from "@/features/integration-whatsapp/message-templates/components/template-preview"
import { useWorkspaceId } from "@/hooks/routing"
import { client } from "@/lib/orpc/orpc"
import type { BroadcastResourceWithRelations } from "./schemas/resource"

type BroadcastStatusBadgeVariant = "default" | "outline" | "secondary"

const BROADCAST_STATUS_VARIANTS: Partial<
  Record<string, BroadcastStatusBadgeVariant>
> = {
  cancelled: "secondary",
  scheduled: "outline",
}

type BroadcastDetailDialogProps = {
  broadcast: BroadcastResourceWithRelations | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function BroadcastDetailDialog({
  broadcast,
  open,
  onOpenChange,
}: BroadcastDetailDialogProps) {
  const t = useTranslations()
  const formatter = useFormatter()
  const workspaceId = useWorkspaceId()
  const [templateDetail, setTemplateDetail] =
    useState<BroadcastTemplateDetail | null>(null)
  const [loadingTemplateDetail, setLoadingTemplateDetail] = useState(false)

  useEffect(() => {
    if (!(open && broadcast?.templateId)) {
      setTemplateDetail(null)
      setLoadingTemplateDetail(false)
      return
    }

    let isActive = true
    setLoadingTemplateDetail(true)

    client.broadcastAPIs
      .privateGetBroadcastTemplateDetailAPI({
        workspaceId,
        broadcastId: broadcast.id,
      })
      .then((detail) => {
        if (isActive) {
          setTemplateDetail(detail)
        }
      })
      .catch(() => {
        if (isActive) {
          setTemplateDetail(null)
        }
      })
      .finally(() => {
        if (isActive) {
          setLoadingTemplateDetail(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [broadcast?.id, broadcast?.templateId, open, workspaceId])

  const contactFilter = useMemo(() => {
    const parsed = contactFilterCriteriaSchema.safeParse(
      broadcast?.contactFilter,
    )
    return parsed.success ? parsed.data : null
  }, [broadcast?.contactFilter])

  if (!broadcast) {
    return (
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent />
      </Dialog>
    )
  }

  const channel = channelTypes.safeParse(broadcast.channel)
  const channelValue = channel.success
    ? channel.data
    : channelTypes.enum.omnichannel
  const subaction = broadcastSubactions.safeParse(broadcast.subaction)
  const templateData = broadcast.templateData as
    | WaTemplateParams
    | MessengerTemplateParams
    | null
    | undefined

  // Omnichannel broadcasts target every connected page, so they have no single
  // integration; otherwise show the connected page (inbox) name it sends to.
  const integrationValue =
    channelValue === channelTypes.enum.omnichannel
      ? t("fields.omnichannel.label")
      : (broadcast.integrationWhatsapp?.name ??
        broadcast.integrationMessenger?.name ??
        "-")

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-screen overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("broadcasts.detail.title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <DetailField
              label={t("fields.name.label")}
              value={broadcast.name}
            />
            <DetailField
              label={t("fields.channel.label")}
              value={
                <InboxIcon
                  channel={channelValue}
                  label={t(`fields.${channelValue}.label`)}
                  size="small"
                />
              }
            />
            <DetailField
              label={t("broadcasts.detail.integration")}
              value={integrationValue}
            />
            <DetailField
              label={t("broadcasts.detail.subaction")}
              value={
                subaction.success
                  ? t(`broadcasts.${subaction.data}.title`)
                  : broadcast.subaction
              }
            />
            <DetailField
              label={t("fields.status.label")}
              value={
                <Badge
                  variant={
                    BROADCAST_STATUS_VARIANTS[broadcast.status] ?? "default"
                  }
                >
                  {t(`broadcasts.status.${broadcast.status}`)}
                </Badge>
              }
            />
            <DetailField
              label={t("fields.schedule.label")}
              value={t(`fields.schedule.${broadcast.schedulesType}`)}
            />
            <DetailField
              label={t("fields.scheduledAt.label")}
              value={format(
                new Date(broadcast.schedulesAt),
                "yyyy/MM/dd HH:mm",
              )}
            />
            <DetailField
              label={t("fields.estimatedContacts.label")}
              value={
                broadcast.contactCount == null
                  ? "-"
                  : formatter.number(broadcast.contactCount)
              }
            />
            <DetailField
              label={t("fields.flowId.label")}
              value={broadcast.flow?.name ?? broadcast.flowId ?? "-"}
            />
          </div>

          <section className="space-y-2">
            <h3 className="font-medium text-sm">
              {t("broadcasts.detail.audienceFilter")}
            </h3>
            <ContactFilterSummary contactFilter={contactFilter} />
          </section>

          <section className="space-y-3">
            <h3 className="font-medium text-sm">
              {t("broadcasts.detail.template")}
            </h3>
            <TemplateSection
              loading={loadingTemplateDetail}
              templateData={templateData}
              templateDetail={templateDetail}
            />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  )
}

function TemplateSection({
  loading,
  templateDetail,
  templateData,
}: {
  loading: boolean
  templateDetail: BroadcastTemplateDetail | null
  templateData: WaTemplateParams | MessengerTemplateParams | null | undefined
}) {
  const t = useTranslations()

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (!templateDetail) {
    return (
      <div className="text-muted-foreground text-sm">
        {t("broadcasts.detail.noTemplate")}
      </div>
    )
  }

  const components = Array.isArray(templateDetail.components)
    ? templateDetail.components
    : []

  return (
    <div className="space-y-3">
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <DetailField
          label={t("fields.name.label")}
          value={`${templateDetail.name} (${templateDetail.language})`}
        />
        <DetailField
          label={t("fields.category.label")}
          value={templateDetail.category}
        />
        <DetailField
          label={t("fields.status.label")}
          value={templateDetail.status}
        />
        <DetailField
          label={t("broadcasts.detail.integration")}
          value={templateDetail.integrationName ?? "-"}
        />
      </div>

      {templateDetail.channel === "whatsapp" ? (
        <TemplatePreview
          bodyParams={
            (templateData as WaTemplateParams | undefined)?.body ?? []
          }
          buttonParams={
            (templateData as WaTemplateParams | undefined)?.button ?? []
          }
          components={components as TemplateComponent[]}
          headerParams={
            (templateData as WaTemplateParams | undefined)?.header ?? []
          }
        />
      ) : (
        <MessengerTemplatePreview
          bodyParams={
            (templateData as MessengerTemplateParams | undefined)?.body ?? []
          }
          buttonParams={
            (templateData as MessengerTemplateParams | undefined)?.button ?? []
          }
          components={components as MessengerTemplateComponent[]}
          headerParams={
            (templateData as MessengerTemplateParams | undefined)?.header ?? []
          }
        />
      )}
    </div>
  )
}
