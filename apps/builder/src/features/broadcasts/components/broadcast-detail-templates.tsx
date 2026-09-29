"use client"

import type { BroadcastTemplateDetail } from "@chatbotx.io/business"
import { resolveBroadcastTemplateSend } from "@chatbotx.io/database/partials"
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
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { ChevronDownIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { MessengerTemplatePreview } from "@/features/integration-messenger/message-templates/components/template-preview"
import { TemplatePreview } from "@/features/integration-whatsapp/message-templates/components/template-preview"
import type { BroadcastTemplateDetailsState } from "../hooks/use-broadcast-template-details"
import {
  type BroadcastTemplatePage,
  findPageTemplateDetail,
  resolveBroadcastTemplatePages,
} from "../lib/broadcast-detail-pages"
import type { BroadcastInboxLabelKey } from "../lib/broadcast-inbox-label"
import type { BroadcastResourceWithRelations } from "../schema/resource"
import { BroadcastDetailField } from "./broadcast-detail-field"
import { TemplatePreviewBoundary } from "./template-preview-boundary"

type TemplateData =
  | WaTemplateParams
  | MessengerTemplateParams
  | null
  | undefined

/**
 * One block per page that sends a template. A page whose template was
 * deleted (or dropped by a re-sync) still gets a block saying so, and a
 * failed request shows a load error — the dialog never breaks on either.
 */
export function BroadcastDetailTemplates({
  broadcast,
  state,
  pageLabelKey,
}: {
  broadcast: BroadcastResourceWithRelations
  state: BroadcastTemplateDetailsState
  pageLabelKey: BroadcastInboxLabelKey
}) {
  const t = useTranslations()

  if (state.status === "idle" || state.status === "loading") {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (state.status === "error") {
    return (
      <div className="text-muted-foreground text-sm">
        {t("messages.errorLoadingData")}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {resolveBroadcastTemplatePages(broadcast).map((page) => {
        const templateDetail = findPageTemplateDetail(page, state.details)
        const key = `${page.pageId ?? "legacy"}-${page.templateId}`

        return templateDetail ? (
          <TemplatePageBlock
            key={key}
            pageLabelKey={pageLabelKey}
            // Each page is previewed with the params it was sent with (a
            // legacy row keeps them on the broadcast itself).
            templateData={
              resolveBroadcastTemplateSend(broadcast, templateDetail.inboxId)
                ?.templateData as TemplateData
            }
            templateDetail={templateDetail}
          />
        ) : (
          <MissingTemplatePageBlock
            key={key}
            page={page}
            pageLabelKey={pageLabelKey}
          />
        )
      })}
    </div>
  )
}

function MissingTemplatePageBlock({
  page,
  pageLabelKey,
}: {
  page: BroadcastTemplatePage
  pageLabelKey: BroadcastInboxLabelKey
}) {
  const t = useTranslations()

  return (
    <div className="grid gap-3 text-sm sm:grid-cols-2">
      <BroadcastDetailField label={t(pageLabelKey)} value={page.pageName} />
      <BroadcastDetailField
        label={t("fields.name.label")}
        value={
          <span className="text-muted-foreground">
            {t("messages.featureNotFound", {
              feature: t("broadcasts.detail.template"),
            })}
          </span>
        }
      />
    </div>
  )
}

function TemplatePageBlock({
  pageLabelKey,
  templateDetail,
  templateData,
}: {
  pageLabelKey: BroadcastInboxLabelKey
  templateDetail: BroadcastTemplateDetail
  templateData: TemplateData
}) {
  const t = useTranslations()
  const components = Array.isArray(templateDetail.components)
    ? templateDetail.components
    : []

  return (
    <div className="space-y-3">
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <BroadcastDetailField
          label={t("fields.name.label")}
          value={`${templateDetail.name} (${templateDetail.language})`}
        />
        <BroadcastDetailField
          label={t("fields.category.label")}
          value={templateDetail.category}
        />
        <BroadcastDetailField
          label={t("fields.status.label")}
          value={templateDetail.status}
        />
        <BroadcastDetailField
          label={t(pageLabelKey)}
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
          <TemplatePreviewBoundary
            fallback={
              <div className="text-muted-foreground text-sm">
                {t("messages.errorLoadingData")}
              </div>
            }
          >
            <TemplateDetailPreview
              channel={templateDetail.channel}
              components={components}
              templateData={templateData}
            />
          </TemplatePreviewBoundary>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

function TemplateDetailPreview({
  channel,
  components,
  templateData,
}: {
  channel: BroadcastTemplateDetail["channel"]
  components: unknown[]
  templateData: TemplateData
}) {
  if (channel === "whatsapp") {
    const params = templateData as WaTemplateParams | undefined
    return (
      <TemplatePreview
        bodyParams={params?.body ?? []}
        buttonParams={params?.button ?? []}
        components={components as TemplateComponent[]}
        headerParams={params?.header ?? []}
      />
    )
  }

  const params = templateData as MessengerTemplateParams | undefined
  return (
    <MessengerTemplatePreview
      bodyParams={params?.body ?? []}
      buttonParams={params?.button ?? []}
      components={components as MessengerTemplateComponent[]}
      headerParams={params?.header ?? []}
    />
  )
}
