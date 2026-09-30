"use client"

import type { ThreadControlState } from "@chatbotx.io/database/partials"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { InfoIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { THREAD_CONTROL_TONES } from "@/features/conversations/components/thread-control-tone"
import {
  type ThreadControlView,
  useThreadOwnerLabel,
} from "@/features/conversations/hooks/use-thread-control"
import { useTenantSettings } from "@/features/tenant/tenant-settings-provider"

/** Short badge label for the raw thread state. */
const THREAD_STATE_KEYS = {
  owned: "conversationRouting.panel.threadStateOwned",
  standby: "conversationRouting.panel.threadStateStandby",
  idle: "conversationRouting.panel.threadStateIdle",
} as const satisfies Record<ThreadControlState, string>

/** Our role on the thread, shown in the highlighted box. */
const ROLE_KEYS = {
  owned: "conversationRouting.panel.selfOwned",
  standby: "conversationRouting.panel.selfStandby",
  idle: "conversationRouting.panel.selfIdle",
} as const satisfies Record<ThreadControlState, string>

const HINT_KEYS = {
  owned: "conversationRouting.panel.hintOwned",
  standby: "conversationRouting.panel.hintStandby",
  idle: "conversationRouting.panel.hintIdle",
} as const satisfies Record<ThreadControlState, string>

const Field = ({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) => (
  <div className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
    <dt className="text-muted-foreground text-xs">{label}</dt>
    <dd className="min-w-0">{children}</dd>
  </div>
)

/**
 * "Conversation routing" side-panel module, laid out as the routing card:
 * whether the thread is claimed, who currently holds it, and what role this
 * app plays. Reads the same store fields as the list pill and composer
 * (`useThreadControl`), so it never disagrees with them.
 */
export function ContactThreadControlSection({
  threadControl,
}: {
  threadControl: ThreadControlView
}) {
  const t = useTranslations()
  const ownerLabel = useThreadOwnerLabel()(
    threadControl.state,
    threadControl.ownerRole,
  )
  const { name: brand } = useTenantSettings()
  const tone = THREAD_CONTROL_TONES[threadControl.state]
  const RoleIcon = tone.icon
  const isClaimed = threadControl.state !== "idle"

  return (
    <div className="flex flex-col gap-3 px-2 text-sm">
      <dl className="flex flex-col divide-y">
        <Field label={t("conversationRouting.panel.threadState")}>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs",
              tone.className,
            )}
          >
            <span
              aria-hidden
              className={cn("size-1.5 rounded-full", tone.dotClassName)}
            />
            {t(THREAD_STATE_KEYS[threadControl.state])}
          </span>
        </Field>
        <Field label={t("conversationRouting.panel.currentOwner")}>
          {isClaimed ? (
            <span className="flex items-center gap-2">
              <tone.icon aria-hidden className="size-4 shrink-0" />
              <span className="truncate font-medium">{ownerLabel}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">
              {t("conversationRouting.panel.noOwner")}
            </span>
          )}
        </Field>
        <Field label={t("conversationRouting.panel.roleLabel", { brand })}>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-medium",
              tone.className,
            )}
          >
            <RoleIcon aria-hidden className="size-3.5 shrink-0" />
            {t(ROLE_KEYS[threadControl.state])}
          </span>
        </Field>
      </dl>
      <p className="flex items-start gap-1.5 rounded-md border bg-muted/40 px-3 py-2 text-muted-foreground text-xs">
        <InfoIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <span>{t(HINT_KEYS[threadControl.state], { brand })}</span>
      </p>
    </div>
  )
}
