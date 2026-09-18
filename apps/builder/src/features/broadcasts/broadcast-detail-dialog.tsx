"use client"

import type { BroadcastTemplateDetail } from "@chatbotx.io/business"
import {
  broadcastSendsTemplate,
  broadcastSubactions,
  channelTypes,
  resolveBroadcastTemplateSend,
} from "@chatbotx.io/database/partials"
import type {
  MessengerTemplateComponent,
  MessengerTemplateParams,
  TemplateComponent,
  WaTemplateParams,
} from "@chatbotx.io/flow-config"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@chatbotx.io/ui/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { format } from "date-fns"
import { ChevronDownIcon, ExternalLinkIcon } from "lucide-react"
import Link from "next/link"
import { useFormatter, useTranslations } from "next-intl"
import { type ReactNode, useEffect, useMemo, useState } from "react"
import { ContactFilterSummary } from "@/features/contact-filter/components/contact-filter-summary"
import { contactFilterCriteriaSchema } from "@/features/contact-filter/schema"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"
import { MessengerTemplatePreview } from "@/features/integration-messenger/message-templates/components/template-preview"
import { TemplatePreview } from "@/features/integration-whatsapp/message-templates/components/template-preview"
import { useWorkspaceId } from "@/hooks/routing"
import { client } from "@/lib/orpc/orpc"
import { BroadcastStatusBadge } from "./components/broadcast-status-badge"
import { resolveBroadcastScheduleTypeMessageKey } from "./lib/schedule-type-options"
import type { BroadcastResourceWithRelations } from "./schema/resource"

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
  const [templateDetails, setTemplateDetails] = useState<
    BroadcastTemplateDetail[]
  >([])
  const [loadingTemplateDetail, setLoadingTemplateDetail] = useState(false)

  const broadcastId = broadcast?.id
  const sendsTemplate = broadcast ? broadcastSendsTemplate(broadcast) : false

  useEffect(() => {
    if (!(open && broadcastId && sendsTemplate)) {
      setTemplateDetails([])
      setLoadingTemplateDetail(false)
      return
    }

    let isActive = true
    setLoadingTemplateDetail(true)

    client.broadcastAPIs
      .privateListBroadcastTemplateDetailsAPI({
        workspaceId,
        broadcastId,
      })
      .then((details) => {
        if (isActive) {
          setTemplateDetails(details)
        }
      })
      .catch(() => {
        if (isActive) {
          setTemplateDetails([])
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
  }, [broadcastId, sendsTemplate, open, workspaceId])

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

  const integrationValue =
    channelValue === channelTypes.enum.omnichannel
      ? t("fields.omnichannel.label")
      : resolveBroadcastPageNames(broadcast)

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      {/* The header stays put and only the body scrolls, so a broadcast with
          several page templates never pushes the title and close button off
          screen. */}
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("broadcasts.detail.title")}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pe-1">
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
              value={<BroadcastStatusBadge status={broadcast.status} />}
            />
            <DetailField
              label={t("fields.schedule.label")}
              value={t(
                resolveBroadcastScheduleTypeMessageKey(broadcast.schedulesType),
              )}
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
          </div>

          <section className="space-y-2">
            <h3 className="font-medium text-sm">
              {t("broadcasts.detail.audienceFilter")}
            </h3>
            <ContactFilterSummary contactFilter={contactFilter} />
          </section>

          {/* A broadcast delivers either templates or flows, never both. */}
          {sendsTemplate ? (
            <section className="space-y-3">
              <h3 className="font-medium text-sm">
                {t("broadcasts.detail.template")}
              </h3>
              <TemplateSection
                broadcast={broadcast}
                loading={loadingTemplateDetail}
                templateDetails={templateDetails}
              />
            </section>
          ) : (
            <section className="space-y-3">
              <h3 className="font-medium text-sm">{t("fields.flow.label")}</h3>
              <PageFlowList
                pageFlows={resolveBroadcastPageFlows(broadcast)}
                workspaceId={workspaceId}
              />
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** The page a legacy single-page broadcast sends from, else a dash. */
function resolveLegacyPageName(
  broadcast: BroadcastResourceWithRelations,
): string {
  return (
    broadcast.integrationWhatsapp?.name ??
    broadcast.integrationMessenger?.name ??
    "-"
  )
}

/**
 * The page(s) a broadcast sends from: every target page of a multi-page
 * broadcast, else the legacy integration's page, else a dash.
 */
function resolveBroadcastPageNames(
  broadcast: BroadcastResourceWithRelations,
): string {
  const targetPageNames = (broadcast.targets ?? []).map(
    (target) => target.inbox.name,
  )
  if (targetPageNames.length > 0) {
    return targetPageNames.join(", ")
  }
  return resolveLegacyPageName(broadcast)
}

type BroadcastPageFlow = {
  pageId: string
  pageName: string
  flowId: string
  flowName: string
}

/**
 * The flow each page runs: one row per target page in targets mode, else the
 * legacy broadcast-level flow. A flow whose row is gone keeps its id as name.
 */
function resolveBroadcastPageFlows(
  broadcast: BroadcastResourceWithRelations,
): BroadcastPageFlow[] {
  const targetFlows = (broadcast.targets ?? []).flatMap((target) =>
    target.flowId
      ? [
          {
            pageId: target.inboxId,
            pageName: target.inbox.name,
            flowId: target.flowId,
            flowName: target.flow?.name ?? target.flowId,
          },
        ]
      : [],
  )
  if (targetFlows.length > 0 || !broadcast.flowId) {
    return targetFlows
  }
  return [
    {
      pageId: broadcast.id,
      pageName: resolveLegacyPageName(broadcast),
      flowId: broadcast.flowId,
      flowName: broadcast.flow?.name ?? broadcast.flowId,
    },
  ]
}

function PageFlowList({
  pageFlows,
  workspaceId,
}: {
  pageFlows: BroadcastPageFlow[]
  workspaceId: string
}) {
  const t = useTranslations()

  if (pageFlows.length === 0) {
    return <div className="text-muted-foreground text-sm">-</div>
  }

  return (
    <div className="divide-y rounded-lg border text-sm">
      <div className="grid grid-cols-2 gap-3 px-3 py-2 text-muted-foreground">
        <span>{t("broadcasts.detail.integration")}</span>
        <span>{t("fields.flow.label")}</span>
      </div>
      {pageFlows.map((pageFlow) => (
        <div
          className="grid grid-cols-2 gap-3 px-3 py-2"
          key={`${pageFlow.pageId}-${pageFlow.flowId}`}
        >
          <span className="font-medium">{pageFlow.pageName}</span>
          <Link
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            href={`/space/${workspaceId}/flows/${pageFlow.flowId}`}
            rel="noopener noreferrer"
            target="_blank"
          >
            {pageFlow.flowName}
            <ExternalLinkIcon className="size-3.5 shrink-0" />
          </Link>
        </div>
      ))}
    </div>
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
  broadcast,
  loading,
  templateDetails,
}: {
  broadcast: BroadcastResourceWithRelations
  loading: boolean
  templateDetails: BroadcastTemplateDetail[]
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

  if (templateDetails.length === 0) {
    return (
      <div className="text-muted-foreground text-sm">
        {t("broadcasts.detail.noTemplate")}
      </div>
    )
  }

  // One block per page: each template is previewed with the params that
  // page was sent with (a legacy row keeps them on the broadcast itself).
  return (
    <div className="space-y-6">
      {templateDetails.map((templateDetail) => (
        <TemplateDetailBlock
          key={`${templateDetail.inboxId}-${templateDetail.id}`}
          templateData={
            resolveBroadcastTemplateSend(broadcast, templateDetail.inboxId)
              ?.templateData as
              | WaTemplateParams
              | MessengerTemplateParams
              | null
              | undefined
          }
          templateDetail={templateDetail}
        />
      ))}
    </div>
  )
}

function TemplateDetailBlock({
  templateDetail,
  templateData,
}: {
  templateDetail: BroadcastTemplateDetail
  templateData: WaTemplateParams | MessengerTemplateParams | null | undefined
}) {
  const t = useTranslations()
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

      {/* Collapsed by default: a template preview is tall, and a broadcast
          sent from several pages shows one per page. */}
      <Collapsible>
        <CollapsibleTrigger className="group flex items-center gap-1 text-muted-foreground text-sm">
          <ChevronDownIcon className="size-4 transition-transform group-data-[panel-open]:rotate-180" />
          {t("flows.fields.preview")}
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <TemplateDetailPreview
            components={components}
            templateData={templateData}
            templateDetail={templateDetail}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

function TemplateDetailPreview({
  components,
  templateDetail,
  templateData,
}: {
  components: unknown[]
  templateDetail: BroadcastTemplateDetail
  templateData: WaTemplateParams | MessengerTemplateParams | null | undefined
}) {
  return templateDetail.channel === "whatsapp" ? (
    <TemplatePreview
      bodyParams={(templateData as WaTemplateParams | undefined)?.body ?? []}
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
  )
}
