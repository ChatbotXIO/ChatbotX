"use client"

import type {
  ContactEventModel,
  LifecycleStageModel,
} from "@chatbotx.io/database/types"
import { format } from "date-fns"
import {
  ArrowRightIcon,
  BanIcon,
  CheckCircle2Icon,
  PencilIcon,
  ShieldCheckIcon,
  TagIcon,
  UserPlusIcon,
  UsersIcon,
  XIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { type ReactNode, useEffect, useState } from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { listContactEvents } from "../queries/list-contact-events.query"

type ContactActivityLogProps = {
  contactId: string
  lifecycleStages?: LifecycleStageModel[]
}

// Mapping de eventType pra ícone + label render. Mantém em sync com
// contactEventTypes do @chatbotx.io/business (não importamos pra n criar
// dep client→business só pelo enum).
type EventRenderer = {
  icon: typeof TagIcon
  iconClass: string
  buildLabel: (
    meta: Record<string, unknown>,
    stageById: Map<string, LifecycleStageModel>,
  ) => ReactNode
}

const EVENT_RENDERERS: Record<string, EventRenderer> = {
  "contact.created": {
    icon: UserPlusIcon,
    iconClass: "text-emerald-500",
    buildLabel: () => "Contato criado",
  },
  "contact.blocked": {
    icon: BanIcon,
    iconClass: "text-destructive",
    buildLabel: () => "Contato bloqueado",
  },
  "contact.unblocked": {
    icon: ShieldCheckIcon,
    iconClass: "text-emerald-500",
    buildLabel: () => "Contato desbloqueado",
  },
  "contact.lifecycle.changed": {
    icon: ArrowRightIcon,
    iconClass: "text-primary",
    buildLabel: (meta, stageById) => {
      const from = meta.fromStageId
        ? stageById.get(meta.fromStageId as string)
        : null
      const to = meta.toStageId ? stageById.get(meta.toStageId as string) : null
      return (
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-muted px-1.5 py-0.5">
            {from ? `${from.icon ?? "•"} ${from.name}` : "—"}
          </span>
          <ArrowRightIcon className="size-3 text-muted-foreground" />
          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-primary">
            {to ? `${to.icon ?? "•"} ${to.name}` : "—"}
          </span>
        </div>
      )
    },
  },
  "contact.tag.added": {
    icon: TagIcon,
    iconClass: "text-blue-500",
    buildLabel: (meta) => {
      const names = (meta.tagNames as string[] | undefined) ?? []
      const list = names.map((n) => `"${n}"`).join(", ")
      return `Etiqueta${names.length > 1 ? "s" : ""} ${list} aplicada${names.length > 1 ? "s" : ""}`
    },
  },
  "contact.tag.removed": {
    icon: XIcon,
    iconClass: "text-muted-foreground",
    buildLabel: (meta) => {
      const names = (meta.tagNames as string[] | undefined) ?? []
      const list = names.map((n) => `"${n}"`).join(", ")
      return `Etiqueta${names.length > 1 ? "s" : ""} ${list} removida${names.length > 1 ? "s" : ""}`
    },
  },
  "contact.field.updated": {
    icon: PencilIcon,
    iconClass: "text-amber-500",
    buildLabel: (meta) => {
      const keys = (meta.keys as string[] | undefined) ?? []
      const list = keys.map((k) => `"${k}"`).join(", ")
      return `Campo${keys.length > 1 ? "s" : ""} ${list} atualizado${keys.length > 1 ? "s" : ""}`
    },
  },
  "contact.merged": {
    icon: UsersIcon,
    iconClass: "text-purple-500",
    buildLabel: (meta) => {
      const count = (meta.mergedCount as number | undefined) ?? 0
      return `Mesclado com ${count} contato${count === 1 ? "" : "s"}`
    },
  },
  "contact.conversation.closedWithNote": {
    icon: CheckCircle2Icon,
    iconClass: "text-emerald-500",
    buildLabel: (meta) => {
      const categoryName = meta.categoryName as string | null | undefined
      const summary = meta.summary as string | null | undefined
      const closedBy = meta.closedByUserName as string | null | undefined
      return (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span>
              {closedBy ? `${closedBy} fechou a conversa` : "Conversa fechada"}
            </span>
            {categoryName ? (
              <span className="rounded bg-primary/15 px-1.5 py-0.5 text-primary">
                {categoryName}
              </span>
            ) : null}
          </div>
          {summary ? (
            <div className="rounded border border-white/[0.06] bg-white/[0.02] p-2 text-muted-foreground italic">
              "{summary}"
            </div>
          ) : null}
        </div>
      )
    },
  },
}

export function ContactActivityLog({
  contactId,
  lifecycleStages = [],
}: ContactActivityLogProps) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const [events, setEvents] = useState<ContactEventModel[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    listContactEvents({ contactId, workspaceId, limit: 20 })
      .then((data) => {
        if (mounted) {
          setEvents(data)
          setLoading(false)
        }
      })
      .catch(() => {
        if (mounted) {
          setLoading(false)
        }
      })
    return () => {
      mounted = false
    }
  }, [contactId, workspaceId])

  const stageById = new Map<string, LifecycleStageModel>()
  for (const s of lifecycleStages) {
    stageById.set(s.id, s)
  }

  if (loading) {
    return <div className="px-2 py-3 text-muted-foreground text-xs">...</div>
  }

  if (events.length === 0) {
    return (
      <div className="px-2 py-3 text-muted-foreground text-xs">
        {t("lifecycle.activityLogEmpty")}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 px-2 py-2">
      {events.map((event) => {
        const meta = (event.meta ?? {}) as Record<string, unknown>
        const renderer = EVENT_RENDERERS[event.eventType]
        const Icon = renderer?.icon ?? PencilIcon
        return (
          <div className="flex flex-col gap-1 text-xs" key={event.id}>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Icon className={`size-3 ${renderer?.iconClass ?? ""}`} />
              <span>
                {format(new Date(event.createdAt), "dd/MM/yyyy HH:mm")}
              </span>
            </div>
            <div className="pl-4.5">
              {renderer
                ? renderer.buildLabel(meta, stageById)
                : `Evento: ${event.eventType}`}
            </div>
          </div>
        )
      })}
    </div>
  )
}
