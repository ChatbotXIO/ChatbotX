"use client"

import {
  broadcastSendsTemplate,
  broadcastSubactions,
  channelTypes,
} from "@chatbotx.io/database/partials"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { format } from "date-fns"
import { useFormatter, useTranslations } from "next-intl"
import { useMemo } from "react"
import { ContactFilterSummary } from "@/features/contact-filter/components/contact-filter-summary"
import { contactFilterCriteriaSchema } from "@/features/contact-filter/schema"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"
import { useWorkspaceId } from "@/hooks/routing"
import { BroadcastDetailField } from "./components/broadcast-detail-field"
import { BroadcastDetailFlows } from "./components/broadcast-detail-flows"
import { BroadcastDetailTemplates } from "./components/broadcast-detail-templates"
import { BroadcastStatusBadge } from "./components/broadcast-status-badge"
import { useBroadcastTemplateDetails } from "./hooks/use-broadcast-template-details"
import {
  resolveBroadcastPageFlows,
  resolveBroadcastPageNames,
} from "./lib/broadcast-detail-pages"
import { resolveBroadcastInboxLabelKey } from "./lib/broadcast-inbox-label"
import { describeBroadcastSendLimit } from "./lib/broadcast-send-limit"
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

  const sendsTemplate = broadcast ? broadcastSendsTemplate(broadcast) : false
  const templateDetailsState = useBroadcastTemplateDetails({
    workspaceId,
    broadcastId: broadcast?.id,
    enabled: open && sendsTemplate,
  })

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
  const sendLimitSummary = describeBroadcastSendLimit(broadcast, t)
  // Names each page the way the create form's page picker does.
  const pageLabelKey = resolveBroadcastInboxLabelKey(channelValue)

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
            <BroadcastDetailField
              label={t("fields.name.label")}
              value={broadcast.name}
            />
            <BroadcastDetailField
              label={t("fields.channel.label")}
              value={
                <InboxIcon
                  channel={channelValue}
                  label={t(`fields.${channelValue}.label`)}
                  size="small"
                />
              }
            />
            <BroadcastDetailField
              label={t("broadcasts.detail.integration")}
              value={integrationValue}
            />
            <BroadcastDetailField
              label={t("broadcasts.detail.subaction")}
              value={
                subaction.success
                  ? t(`broadcasts.${subaction.data}.title`)
                  : broadcast.subaction
              }
            />
            <BroadcastDetailField
              label={t("fields.status.label")}
              value={<BroadcastStatusBadge status={broadcast.status} />}
            />
            <BroadcastDetailField
              label={t("fields.schedule.label")}
              value={t(
                resolveBroadcastScheduleTypeMessageKey(broadcast.schedulesType),
              )}
            />
            <BroadcastDetailField
              label={t("fields.scheduledAt.label")}
              value={format(
                new Date(broadcast.schedulesAt),
                "yyyy/MM/dd HH:mm",
              )}
            />
            <BroadcastDetailField
              label={t("fields.estimatedContacts.label")}
              value={
                broadcast.contactCount == null
                  ? "-"
                  : formatter.number(broadcast.contactCount)
              }
            />
            {sendLimitSummary && (
              <BroadcastDetailField
                label={t("broadcasts.detail.sendLimit")}
                value={sendLimitSummary}
              />
            )}
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
              <BroadcastDetailTemplates
                broadcast={broadcast}
                pageLabelKey={pageLabelKey}
                state={templateDetailsState}
              />
            </section>
          ) : (
            <section className="space-y-3">
              <h3 className="font-medium text-sm">{t("fields.flow.label")}</h3>
              <BroadcastDetailFlows
                pageFlows={resolveBroadcastPageFlows(broadcast)}
                pageLabelKey={pageLabelKey}
                workspaceId={workspaceId}
              />
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
