"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Loader2Icon, UndoIcon, UsersIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { unmergeContactsAction } from "../actions/unmerge-contacts.action"
import {
  listContactsMergedInto,
  type MergedIntoContact,
} from "../queries/list-merged-into"

type MergedContactsPanelProps = {
  workspaceId: string
  primaryContactId: string
}

// Panel exibido no drawer do contato primary quando ele tem N contatos
// fundidos. Mostra lista + botão "Desfazer fusão" por linha (#17 Fase E).
// Lazy-fetch via server action — só carrega quando o contato é primary
// de algum merge (mais comum é estar vazio).
export function MergedContactsPanel({
  workspaceId,
  primaryContactId,
}: MergedContactsPanelProps) {
  const t = useTranslations()
  const [contacts, setContacts] = useState<MergedIntoContact[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    listContactsMergedInto(workspaceId, primaryContactId)
      .then((rows) => {
        if (mounted) {
          setContacts(rows)
          setLoading(false)
        }
      })
      .catch(() => {
        if (mounted) {
          setContacts([])
          setLoading(false)
        }
      })
    return () => {
      mounted = false
    }
  }, [workspaceId, primaryContactId])

  const { execute: unmerge, isExecuting } = useAction(
    unmergeContactsAction.bind(null, workspaceId),
    {
      onSuccess: ({ data }) => {
        toast.success(t("contacts.unmerge.successToast"))
        if (data) {
          // Otimista: remove do panel sem refetch
          setContacts(
            (prev) =>
              prev?.filter((c) => !data.unmergedIds.includes(c.id)) ?? null,
          )
        }
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] p-3 text-muted-foreground text-xs">
        <Loader2Icon className="size-3 animate-spin" />
        <span>{t("contacts.unmerge.loading")}</span>
      </div>
    )
  }

  if (!contacts || contacts.length === 0) {
    return null
  }

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-md border border-amber-500/30 bg-amber-500/[0.06] p-3">
      <div className="flex items-center gap-2 text-amber-200">
        <UsersIcon className="size-4" />
        <span className="font-medium text-xs">
          {t("contacts.unmerge.bannerTitle", { count: contacts.length })}
        </span>
      </div>
      <p className="text-amber-200/80 text-xs leading-relaxed">
        {t("contacts.unmerge.warning")}
      </p>
      <ul className="flex flex-col gap-1.5">
        {contacts.map((c) => {
          const name =
            c.fullName || c.email || c.phoneNumber || `#${c.id.slice(-6)}`
          return (
            <li
              className="flex items-center justify-between gap-2 rounded border border-white/[0.06] bg-black/20 px-2 py-1.5"
              key={c.id}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-sm">{name}</div>
                {c.email || c.phoneNumber ? (
                  <div className="truncate text-muted-foreground text-xs">
                    {c.email || c.phoneNumber}
                  </div>
                ) : null}
              </div>
              <Button
                aria-label={t("contacts.unmerge.button")}
                className="h-7 shrink-0 gap-1 px-2 text-xs"
                disabled={isExecuting}
                onClick={() =>
                  unmerge({
                    primaryId: primaryContactId,
                    duplicateIds: [c.id],
                  })
                }
                size="sm"
                type="button"
                variant="outline"
              >
                <UndoIcon className="size-3" />
                {t("contacts.unmerge.button")}
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
