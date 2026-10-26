"use client"

import { format } from "date-fns"
import Image from "next/image"
import { useTranslations } from "next-intl"
import type { WorkspaceDeletionRecordResource } from "@/features/workspaces/schema/deletion-record"

type PeriodUsage =
  WorkspaceDeletionRecordResource["usageSnapshot"]["mac"][number]

type DeletionRecordEvidenceProps = {
  record: WorkspaceDeletionRecordResource
}

type EvidenceFieldProps = {
  label: string
  value: string | number
}

type UsagePeriodListProps = {
  formatPeriod: (period: PeriodUsage) => string
  label: string
  notAvailable: string
  periods: PeriodUsage[]
}

const EvidenceField = ({ label, value }: EvidenceFieldProps) => (
  <div className="space-y-0.5">
    <dt className="text-muted-foreground text-xs">{label}</dt>
    <dd className="break-words text-sm">{value}</dd>
  </div>
)

const UsagePeriodList = ({
  formatPeriod,
  label,
  notAvailable,
  periods,
}: UsagePeriodListProps) => (
  <section className="space-y-2">
    <h5 className="font-medium text-sm">{label}</h5>
    {periods.length > 0 ? (
      <ul className="space-y-1">
        {periods.map((period) => (
          <li
            className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm"
            key={`${period.periodStart}-${period.periodEnd}`}
          >
            <span>{period.count}</span>
            <span className="text-muted-foreground text-xs">
              {formatPeriod(period)}
            </span>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-muted-foreground text-sm">{notAvailable}</p>
    )}
  </section>
)

export const DeletionRecordEvidence = ({
  record,
}: DeletionRecordEvidenceProps) => {
  const t = useTranslations()
  const notAvailable = t("platformAdmin.workspaces.notAvailable")
  const formatDate = (value: Date | string | null) =>
    value ? format(value, "PPp") : notAvailable
  const formatPeriod = (period: PeriodUsage) =>
    `${formatDate(period.periodStart)} – ${formatDate(period.periodEnd)}`
  const workspace = record.details.workspace
  const owner = record.details.owner
  const requestedBy = record.details.requestedBy
  const plan = record.details.plan
  const ownerQuota = record.usageSnapshot.ownerQuota

  return (
    <details className="rounded-md border bg-muted/20 p-3">
      <summary className="cursor-pointer font-medium">
        {t("platformAdmin.workspaces.evidence")}
      </summary>
      <div className="mt-3 space-y-4">
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            {workspace.logo && (
              <Image
                alt={workspace.name}
                className="size-8 rounded object-cover"
                height={32}
                src={workspace.logo}
                unoptimized
                width={32}
              />
            )}
            <h4 className="font-medium text-sm">
              {t("fields.workspace.label")}
            </h4>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <EvidenceField
              label={t("platformAdmin.workspaces.workspaceId")}
              value={workspace.id}
            />
            <EvidenceField
              label={t("platformAdmin.workspaces.language")}
              value={workspace.language}
            />
            <EvidenceField
              label={t("fields.createdAt.label")}
              value={formatDate(workspace.createdAt)}
            />
            <EvidenceField
              label={t("condition.fields.timezone")}
              value={workspace.timezone}
            />
          </dl>
        </section>

        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <EvidenceField
            label={t("platformAdmin.workspaces.owner")}
            value={owner.name ?? owner.email ?? notAvailable}
          />
          <EvidenceField
            label={t("platformAdmin.workspaces.requestedBy")}
            value={requestedBy?.name ?? requestedBy?.email ?? notAvailable}
          />
          <EvidenceField
            label={t("platformAdmin.workspaces.deletionRequestedAt")}
            value={formatDate(record.deletionRequestedAt)}
          />
          <EvidenceField
            label={t("platformAdmin.workspaces.scheduledDeletionAt")}
            value={formatDate(record.scheduledDeletionAt)}
          />
          <EvidenceField
            label={t("platformAdmin.workspaces.purgedAt")}
            value={formatDate(record.purgedAt)}
          />
        </dl>

        <section className="space-y-2">
          <h4 className="font-medium text-sm">
            {t("platformAdmin.workspaces.planSnapshot")}
          </h4>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <EvidenceField
              label={t("billing.plan.currentLabel")}
              value={plan?.planName ?? notAvailable}
            />
            <EvidenceField
              label={t("fields.status.label")}
              value={plan?.planStatus ?? notAvailable}
            />
            <EvidenceField
              label={t("platformAdmin.workspaces.periodStart")}
              value={formatDate(plan?.periodStart ?? null)}
            />
            <EvidenceField
              label={t("platformAdmin.workspaces.periodEnd")}
              value={formatDate(plan?.periodEnd ?? null)}
            />
          </dl>
        </section>

        <section className="space-y-2">
          <h4 className="font-medium text-sm">
            {t("platformAdmin.workspaces.usage")}
          </h4>
          <dl className="grid gap-3 sm:grid-cols-3">
            <EvidenceField
              label={t("billing.usage.contacts")}
              value={record.usageSnapshot.contacts}
            />
            <EvidenceField
              label={t("billing.usage.channels")}
              value={record.usageSnapshot.channels}
            />
            <EvidenceField
              label={t("billing.usage.teamMembers")}
              value={record.usageSnapshot.teamMembers}
            />
          </dl>
        </section>

        <section className="space-y-2">
          <h4 className="font-medium text-sm">
            {t("platformAdmin.workspaces.usagePeriods")}
          </h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <UsagePeriodList
              formatPeriod={formatPeriod}
              label={t("billing.usage.botMessages")}
              notAvailable={notAvailable}
              periods={record.usageSnapshot.botMessages}
            />
            <UsagePeriodList
              formatPeriod={formatPeriod}
              label={t("billing.usage.mac")}
              notAvailable={notAvailable}
              periods={record.usageSnapshot.mac}
            />
          </div>
        </section>

        <section className="space-y-2">
          <h4 className="font-medium text-sm">
            {t("platformAdmin.workspaces.ownerQuota")}
          </h4>
          {ownerQuota ? (
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <EvidenceField
                label={t("billing.usage.botMessages")}
                value={ownerQuota.botMessagesUsed}
              />
              <EvidenceField
                label={t("billing.usage.monthlyBotMessages")}
                value={ownerQuota.monthlyBotMessagesUsed}
              />
              <EvidenceField
                label={t("billing.usage.mac")}
                value={ownerQuota.macUsed}
              />
              <EvidenceField
                label={t("billing.plan.currentLabel")}
                value={ownerQuota.planName ?? notAvailable}
              />
              <EvidenceField
                label={t("fields.status.label")}
                value={ownerQuota.planStatus ?? notAvailable}
              />
              <EvidenceField
                label={t("platformAdmin.workspaces.periodStart")}
                value={formatDate(ownerQuota.periodStart)}
              />
              <EvidenceField
                label={t("platformAdmin.workspaces.periodEnd")}
                value={formatDate(ownerQuota.periodEnd)}
              />
            </dl>
          ) : (
            <p className="text-muted-foreground text-sm">{notAvailable}</p>
          )}
        </section>

        <section className="space-y-2">
          <h4 className="font-medium text-sm">{t("channels.title")}</h4>
          {record.details.channels.length > 0 ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {record.details.channels.map((channel) => (
                <li
                  className="rounded border bg-background p-2 text-sm"
                  key={channel.id}
                >
                  <div className="font-medium">{channel.name}</div>
                  <div className="text-muted-foreground text-xs">
                    {channel.channel} · {channel.status}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">{notAvailable}</p>
          )}
        </section>

        <section className="space-y-2">
          <h4 className="font-medium text-sm">
            {t("platformAdmin.workspaces.members")}
          </h4>
          {record.details.members.length > 0 ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {record.details.members.map((member) => (
                <li
                  className="rounded border bg-background p-2 text-sm"
                  key={member.userId}
                >
                  <div className="font-medium">
                    {member.name ?? member.email ?? notAvailable}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {[member.email, member.role].filter(Boolean).join(" · ")}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">{notAvailable}</p>
          )}
        </section>
      </div>
    </details>
  )
}
