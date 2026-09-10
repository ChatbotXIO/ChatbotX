"use client"

import type {
  BroadcastSubaction,
  ChannelType,
} from "@chatbotx.io/database/partials"
import { useMemo } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { useInboxStore } from "@/features/inboxes/provider/inbox-store-context"
import type { BroadcastPage } from "../lib/broadcast-target-groups"
import type { BroadcastTargetRequest } from "../schema/action"
import { BroadcastTargetCard } from "./broadcast-target-card"

type BroadcastTemplateTargetsProps = {
  channel: ChannelType
  subaction: BroadcastSubaction
  /** Targets an edited draft was hydrated with (per page), if any. */
  hydratedTargets?: BroadcastTargetRequest[]
}

/**
 * The template half of a multi-page broadcast: one independent card per
 * selected page, each with its own template picker, params form, and
 * preview. A page left without a template is allowed — it is simply skipped
 * at send and receiver-count time.
 */
export function BroadcastTemplateTargets({
  channel,
  subaction,
  hydratedTargets,
}: BroadcastTemplateTargetsProps) {
  const { control } = useFormContext()
  const inboxes = useInboxStore((state) => state.inboxes)

  const inboxIds = (useWatch({ control, name: "inboxIds" }) ?? []) as string[]
  const targets = (useWatch({ control, name: "targets" }) ??
    []) as BroadcastTargetRequest[]

  const pages = useMemo<BroadcastPage[]>(() => {
    const nameById = new Map(inboxes.map((inbox) => [inbox.id, inbox.name]))
    return inboxIds.map((inboxId) => ({
      inboxId,
      inboxName: nameById.get(inboxId) ?? inboxId,
    }))
  }, [inboxes, inboxIds])

  return (
    <div className="flex flex-col gap-6">
      {pages.map((page) => {
        const fieldIndex = targets.findIndex(
          (target) => target.inboxId === page.inboxId,
        )
        if (fieldIndex < 0) {
          return null
        }
        const hydratedTemplateId = hydratedTargets?.find(
          (target) => target.inboxId === page.inboxId,
        )?.templateId

        return (
          <BroadcastTargetCard
            channel={channel}
            fieldName={`targets.${fieldIndex}`}
            hydratedTemplateId={hydratedTemplateId}
            inboxId={page.inboxId}
            inboxName={page.inboxName}
            key={page.inboxId}
            subaction={subaction}
          />
        )
      })}
    </div>
  )
}
