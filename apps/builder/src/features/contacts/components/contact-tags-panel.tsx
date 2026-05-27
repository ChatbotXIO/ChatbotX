"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandList,
} from "@chatbotx.io/ui/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { PlusIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { useTagStore } from "@/features/tags/provider/tag-store-context"
import type { TagResource } from "@/features/tags/schema/resource"
import { getTagChipStyle } from "@/features/tags/tag-colors"
import { updateContactTagAction } from "../actions/update-contact-tag.action"

/**
 * Panel de etiquetas pixel-perfect Respond.io.
 *
 * Iteração 38 (Pedro 2026-05-25): refator do popover pra match Respond.io:
 *   - Mostra TODAS as tags (não filtra aplicadas)
 *   - Cada item tem CHECKBOX (marcado = aplicada)
 *   - Click toggle aplica/remove SEM fechar o popover
 *   - Search filtra in-place
 *   - User pode marcar várias antes de fechar
 *
 * Persistência: usa `updateContactTagAction` que recebe `tags: string[]`
 * com os NOMES das tags (idempotente: substitui o conjunto inteiro).
 */
export function ContactTagsPanel({
  workspaceId,
  contactId,
  appliedTags,
  onUpdated,
}: {
  workspaceId: string
  contactId: string
  appliedTags: TagResource[]
  onUpdated: (tags: TagResource[]) => void
}) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const allTags = useTagStore((state) => state.tags)

  const { execute, isPending } = useAction(
    updateContactTagAction.bind(null, workspaceId),
    {
      onSuccess: ({ data }) => {
        if (data) {
          onUpdated(data)
        }
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const appliedIds = useMemo(
    () => new Set(appliedTags.map((tg) => tg.id)),
    [appliedTags],
  )

  const commit = (nextTags: TagResource[]) => {
    execute({ contactId, tags: nextTags.map((tg) => tg.name) })
  }

  const handleToggleTag = (tag: TagResource) => {
    if (appliedIds.has(tag.id)) {
      commit(appliedTags.filter((tg) => tg.id !== tag.id))
    } else {
      commit([...appliedTags, tag])
    }
  }

  const handleRemoveTag = (tagId: string) => {
    commit(appliedTags.filter((tg) => tg.id !== tagId))
  }

  const filteredTags = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) {
      return allTags
    }
    return allTags.filter((tg) => tg.name.toLowerCase().includes(q))
  }, [allTags, search])

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {appliedTags.map((tag) => {
        const style = getTagChipStyle(tag.color)
        return (
          <span
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium text-[12px] transition-opacity hover:opacity-90"
            key={tag.id}
            style={style}
          >
            {tag.emoji && <span className="text-[12px]">{tag.emoji}</span>}
            <span className="max-w-[140px] truncate">{tag.name}</span>
            <button
              aria-label={t("actions.remove") ?? "Remover"}
              className="ml-0.5 flex size-3.5 items-center justify-center rounded-sm transition-colors hover:bg-black/20"
              disabled={isPending}
              onClick={() => handleRemoveTag(tag.id)}
              type="button"
            >
              <XIcon className="size-3" />
            </button>
          </span>
        )
      })}

      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <Button
            aria-label={t("contacts.addTag") ?? "Adicionar etiqueta"}
            className="size-6 rounded-md border border-white/[0.12] text-text-secondary hover:bg-white/[0.06] hover:text-foreground"
            disabled={isPending}
            size="icon"
            type="button"
            variant="ghost"
          >
            <PlusIcon className="size-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[280px] p-0" side="top">
          <Command shouldFilter={false}>
            <CommandInput
              onValueChange={setSearch}
              placeholder={
                t("contacts.searchTag") ?? "Pesquisar e selecionar tags"
              }
              value={search}
            />
            <CommandList className="max-h-[280px]">
              {filteredTags.length === 0 && (
                <CommandEmpty>
                  {t("contacts.noTags") ?? "Nenhuma etiqueta"}
                </CommandEmpty>
              )}
              {filteredTags.length > 0 && (
                <div className="py-1">
                  {filteredTags.map((tag) => {
                    const checked = appliedIds.has(tag.id)
                    const style = getTagChipStyle(tag.color)
                    return (
                      <button
                        className="flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
                        disabled={isPending}
                        key={tag.id}
                        onClick={() => handleToggleTag(tag)}
                        type="button"
                      >
                        <Checkbox
                          aria-label={tag.name}
                          checked={checked}
                          className="pointer-events-none shrink-0"
                          tabIndex={-1}
                        />
                        <span
                          className="inline-flex min-w-0 items-center gap-1 rounded-md px-2 py-0.5 font-medium text-[12px]"
                          style={style}
                        >
                          {tag.emoji && (
                            <span className="shrink-0">{tag.emoji}</span>
                          )}
                          <span className="truncate">{tag.name}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
