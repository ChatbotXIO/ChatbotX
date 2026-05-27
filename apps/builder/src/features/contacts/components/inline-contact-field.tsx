"use client"

import { Input } from "@chatbotx.io/ui/components/ui/input"
import { ExternalLinkIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { type KeyboardEvent, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { updateContactFieldAction } from "../actions/update-contact-field.action"
import type { ContactEditableField } from "../schemas/resource"
import { ListContactField } from "./list-contact-field"

type Props = {
  workspaceId: string
  contactId: string
  field: ContactEditableField
  onUpdated?: (key: string, value: string) => void
}

function resolveInputType(field: ContactEditableField): string {
  // Custom field type tem prioridade (gap #10 Fase D — 2026-05-27).
  switch (field.type) {
    case "url":
      return "url"
    case "time":
      return "time"
    case "date":
      return "date"
    case "datetime":
      return "datetime-local"
    case "email":
      return "email"
    case "phoneNumber":
      return "tel"
    case "number":
      return "number"
    default:
      break
  }
  // Fallback por key pros default fields (firstName/email/phone do contact).
  if (field.key === "email") {
    return "email"
  }
  if (field.key === "phoneNumber") {
    return "tel"
  }
  return "text"
}

// Pixel-perfect Respond.io 2026-05-25 (iteração 30 — Pedro):
// Field editável INLINE. Clica/foca direto no input pra editar. Salva
// no onBlur OU Enter. Ao perder foco, dispara `updateContactFieldAction`
// — mesma action usada pelo modal EditContactField antigo. Modal foi
// REMOVIDO pra match comportamento Respond.io.
//
// Layout:
// - Label 12 px / 600 / muted em cima
// - Input transparente sem border (hover: bg sutil; focus: border sutil)
// - Vazio: placeholder "Adicionar {label}"
export function InlineContactField({
  workspaceId,
  contactId,
  field,
  onUpdated,
}: Props) {
  // Custom field type="list" tem UI completamente diferente (multi-select
  // popover com checkboxes). Delega pra componente próprio.
  if (field.type === "list") {
    return (
      <ListContactField
        contactId={contactId}
        field={field}
        onUpdated={onUpdated}
        workspaceId={workspaceId}
      />
    )
  }
  return (
    <InlineContactFieldInput
      contactId={contactId}
      field={field}
      onUpdated={onUpdated}
      workspaceId={workspaceId}
    />
  )
}

function InlineContactFieldInput({
  workspaceId,
  contactId,
  field,
  onUpdated,
}: Props) {
  const t = useTranslations()
  const [value, setValue] = useState(field.value ?? "")
  const [isEditing, setIsEditing] = useState(false)
  const originalRef = useRef(field.value ?? "")

  // Sincroniza quando prop muda externamente (refresh data).
  useEffect(() => {
    setValue(field.value ?? "")
    originalRef.current = field.value ?? ""
  }, [field.value])

  const { execute, isPending } = useAction(
    updateContactFieldAction.bind(null, workspaceId, contactId),
    {
      onSuccess: () => {
        originalRef.current = value
        onUpdated?.(field.key, value)
      },
      onError: ({ error }) => {
        // Reverte ao valor original em caso de erro.
        setValue(originalRef.current)
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const commit = () => {
    const trimmed = value.trim()
    if (trimmed === originalRef.current) {
      return
    }
    execute({ [field.key]: trimmed } as never)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      e.currentTarget.blur()
    } else if (e.key === "Escape") {
      e.preventDefault()
      setValue(originalRef.current)
      e.currentTarget.blur()
    }
  }

  return (
    /* Pedro 2026-05-25 iter 37: `min-w-0` no container e `truncate` no
       label são OBRIGATÓRIOS pra valores grandes (UUIDs, URLs longas)
       NÃO estourarem fora do drawer. Sem isso o flex parent expande
       fora dos limites e o conteúdo escapa.
       O input nativo trunca naturalmente com text-overflow quando NÃO
       está focado — quando user clica, o texto rola normalmente pra
       edição completa (igual Respond.io). */
    <div className="flex w-full min-w-0 flex-col gap-0.5">
      <label
        className="truncate font-normal text-[14px] text-text-secondary"
        htmlFor={`field-${field.key}`}
      >
        {field.label}
      </label>
      {/* URL preenchida e não editando: mostra link clicável (paridade
          Respond.io). Click no link → edita. Outros tipos: input normal. */}
      {field.type === "url" && value && !isEditing ? (
        <div className="flex h-7 w-full min-w-0 items-center gap-1 px-1">
          <a
            className="min-w-0 flex-1 truncate text-[14px] text-primary underline-offset-2 hover:underline"
            href={value}
            rel="noopener noreferrer"
            target="_blank"
            title={value}
          >
            {value}
          </a>
          <ExternalLinkIcon className="size-3 shrink-0 text-text-tertiary" />
          <button
            className="rounded px-1.5 py-0.5 text-text-tertiary text-xs hover:bg-white/[0.06]"
            onClick={() => setIsEditing(true)}
            type="button"
          >
            {t("actions.edit") ?? "Editar"}
          </button>
        </div>
      ) : (
        <Input
          autoFocus={isEditing}
          className="!bg-transparent overflow-hidden! dark:!bg-transparent h-7 w-full min-w-0 text-ellipsis whitespace-nowrap border-0 px-1 text-[14px] text-text-secondary shadow-none transition-colors hover:bg-white/[0.04] focus:bg-white/[0.06] focus:ring-1 focus:ring-white/[0.12] focus-visible:ring-1 focus-visible:ring-white/[0.12] dark:focus:bg-white/[0.06] dark:hover:bg-white/[0.04]"
          disabled={isPending}
          id={`field-${field.key}`}
          onBlur={() => {
            commit()
            setIsEditing(false)
          }}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`${t("actions.add") ?? "Adicionar"} ${field.label}`}
          type={resolveInputType(field)}
          value={value}
        />
      )}
    </div>
  )
}
