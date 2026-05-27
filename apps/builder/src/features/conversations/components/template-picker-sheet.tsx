"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { ScrollArea } from "@chatbotx.io/ui/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@chatbotx.io/ui/components/ui/sheet"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { client } from "@/lib/orpc/orpc"
import { sendWhatsappTemplateAction } from "../actions/send-whatsapp-template.action"

type Template = {
  id: string
  name: string
  language: string
  category: string
  status: string
  components: unknown
}

type TemplatePickerSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  conversationId: string
}

// Regex top-level (regra biome useTopLevelRegex).
const VARIABLE_RE = /\{\{(\d+)\}\}/g

// Conta placeholders `{{1}}` `{{2}}` no body do template.
// Retorna o maior índice → número de campos pra renderizar no form.
function countBodyVariables(components: unknown): number {
  if (!Array.isArray(components)) {
    return 0
  }
  const body = (components as Array<{ type?: string; text?: string }>).find(
    (c) => c?.type === "BODY",
  )
  if (!body?.text) {
    return 0
  }
  let max = 0
  for (const match of body.text.matchAll(VARIABLE_RE)) {
    const idx = Number.parseInt(match[1] ?? "0", 10)
    if (idx > max) {
      max = idx
    }
  }
  return max
}

// Extrai texto do body pra preview (substitui {{N}} pelos valores ou
// mantém o placeholder se vazio).
function previewBody(components: unknown, variables: string[]): string {
  if (!Array.isArray(components)) {
    return ""
  }
  const body = (components as Array<{ type?: string; text?: string }>).find(
    (c) => c?.type === "BODY",
  )
  if (!body?.text) {
    return ""
  }
  return body.text.replace(VARIABLE_RE, (full, idxRaw: string) => {
    const idx = Number.parseInt(idxRaw, 10) - 1
    return variables[idx]?.trim() || full
  })
}

const CATEGORY_BADGE_CLASS: Record<string, string> = {
  MARKETING: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  UTILITY: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  AUTHENTICATION: "bg-amber-500/15 text-amber-400 border-amber-500/30",
}

export function TemplatePickerSheet({
  open,
  onOpenChange,
  workspaceId,
  conversationId,
}: TemplatePickerSheetProps) {
  const t = useTranslations()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  )
  const [variables, setVariables] = useState<string[]>([])

  // Reset state quando sheet abre/fecha.
  useEffect(() => {
    if (open) {
      setSelectedTemplateId(null)
      setVariables([])
      setLoading(true)
      client.whatsappMessageTemplateAPIs
        .listWhatsappMessageTemplatesInternalAPI({
          workspaceId,
          status: "APPROVED",
        })
        .then((res: unknown) => {
          setTemplates(res as Template[])
        })
        .catch((err: { message?: string }) => {
          toast.error(err.message ?? "Erro ao listar templates")
        })
        .finally(() => {
          setLoading(false)
        })
    }
  }, [open, workspaceId])

  const selectedTemplate = useMemo(
    () => templates.find((tpl) => tpl.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  )

  const varCount = selectedTemplate
    ? countBodyVariables(selectedTemplate.components)
    : 0

  // Garante que o array `variables` cresce/encolhe conforme template muda.
  useEffect(() => {
    if (varCount === variables.length) {
      return
    }
    if (varCount > variables.length) {
      setVariables([
        ...variables,
        ...Array.from({ length: varCount - variables.length }, () => ""),
      ])
    } else {
      setVariables(variables.slice(0, varCount))
    }
  }, [varCount, variables])

  const { execute, isPending } = useAction(
    sendWhatsappTemplateAction.bind(null, workspaceId, conversationId),
    {
      onSuccess: () => {
        toast.success(t("whatsapp.templatePicker.sent") ?? "Template enviado")
        onOpenChange(false)
      },
      onError: ({ error }) => {
        toast.error(error.serverError || "Erro ao enviar template")
      },
    },
  )

  const allVariablesFilled = variables.every((v) => v.trim().length > 0)
  const canSubmit = Boolean(selectedTemplate) && allVariablesFilled

  function handleSend() {
    if (!selectedTemplate) {
      return
    }
    execute({
      templateId: selectedTemplate.id,
      variables: varCount > 0 ? variables : undefined,
    })
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="flex w-[440px] flex-col gap-0 p-0 sm:max-w-[440px]"
        side="right"
      >
        <SheetHeader className="border-white/[0.06] border-b px-4 py-3">
          <SheetTitle className="font-semibold text-[15px]">
            {t("whatsapp.templatePicker.title") ?? "Enviar template"}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-3 px-4 py-3">
            {loading && (
              <p className="text-sm text-text-secondary">
                {t("messages.loading")}
              </p>
            )}

            {!loading && templates.length === 0 && (
              <p className="text-sm text-text-secondary">
                {t("whatsapp.templatePicker.empty") ??
                  "Nenhum template aprovado disponível."}
              </p>
            )}

            {!loading &&
              templates.map((tpl) => {
                const isSelected = tpl.id === selectedTemplateId
                return (
                  <button
                    aria-pressed={isSelected}
                    className={`flex flex-col gap-2 rounded-md border bg-card p-3 text-left transition-colors hover:border-white/[0.16] ${
                      isSelected
                        ? "border-primary/60 ring-1 ring-primary/40"
                        : "border-white/[0.08]"
                    }`}
                    key={tpl.id}
                    onClick={() => setSelectedTemplateId(tpl.id)}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-[13px]">
                        {tpl.name}
                      </span>
                      <Badge
                        className={CATEGORY_BADGE_CLASS[tpl.category] ?? ""}
                        variant="outline"
                      >
                        {tpl.category}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-text-secondary">
                      <span>{tpl.language}</span>
                      <span>·</span>
                      <span>APPROVED</span>
                    </div>
                    <div className="whitespace-pre-wrap text-[12px] text-text-secondary">
                      {previewBody(tpl.components, []).slice(0, 200)}
                    </div>
                  </button>
                )
              })}
          </div>

          {selectedTemplate && varCount > 0 && (
            <div className="border-white/[0.06] border-t px-4 py-3">
              <p className="mb-2 font-medium text-[13px]">
                {t("whatsapp.templatePicker.variables") ?? "Variáveis"}
              </p>
              <div className="flex flex-col gap-2">
                {variables.map((value, idx) => (
                  <div
                    className="flex flex-col gap-1"
                    key={`var-${selectedTemplate.id}-${
                      // biome-ignore lint/suspicious/noArrayIndexKey: index é estável dentro do template selecionado
                      idx
                    }`}
                  >
                    <Label
                      className="text-[12px] text-text-secondary"
                      htmlFor={`tpl-var-${idx}`}
                    >
                      {`{{${idx + 1}}}`}
                    </Label>
                    <Input
                      id={`tpl-var-${idx}`}
                      onChange={(e) => {
                        const next = [...variables]
                        next[idx] = e.target.value
                        setVariables(next)
                      }}
                      placeholder={`Valor para {{${idx + 1}}}`}
                      value={value}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-md border border-white/[0.06] bg-white/[0.03] p-2.5 text-[12px] text-text-secondary">
                <p className="mb-1 font-medium text-text-secondary">
                  {t("whatsapp.templatePicker.preview") ?? "Preview"}
                </p>
                <p className="whitespace-pre-wrap">
                  {previewBody(selectedTemplate.components, variables)}
                </p>
              </div>
            </div>
          )}
        </ScrollArea>

        <div className="flex justify-end gap-2 border-white/[0.06] border-t bg-card px-4 py-3">
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="ghost"
          >
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={!canSubmit || isPending}
            onClick={handleSend}
            type="button"
          >
            {isPending
              ? (t("messages.sending") ?? "Enviando...")
              : (t("actions.send") ?? "Enviar")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
