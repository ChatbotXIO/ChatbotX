"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { SlidersHorizontalIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { updateContactFieldsVisibilityAction } from "../actions/update-contact-fields-visibility.action"
import type { CustomFieldResource } from "../schemas/resource"
import type { ContactFieldVisibilityValue } from "../schemas/visibility"

/**
 * Dialog "Personalizar visualização" — Pedro 2026-05-25 iteração 33.
 *
 * Replica o modal do Respond.io em Settings → Campos de contatos. Lista
 * todos os fields (sistema + custom) e deixa user marcar como
 * "Exibir sempre" / "Sempre ocultar". Persiste workspace-level (afeta
 * todos os usuários).
 *
 * As keys de sistema seguem o nome no schema `Contact` do Drizzle:
 * `phoneNumber`, `firstName`, `lastName`, `email`, `language`,
 * `country`, `profilePicUrl`. As custom usam o id (string) do model
 * `CustomField`.
 */

const SYSTEM_FIELDS: { key: string; labelKey: string }[] = [
  { key: "phoneNumber", labelKey: "fields.phoneNumber.label" },
  { key: "firstName", labelKey: "fields.firstName.label" },
  { key: "lastName", labelKey: "fields.lastName.label" },
  { key: "email", labelKey: "fields.email.label" },
  { key: "language", labelKey: "fields.language.label" },
  { key: "country", labelKey: "fields.country.label" },
]

type Props = {
  workspaceId: string
  /**
   * Lista atual de pares hidden { fieldKey, visibility } (vindo do
   * server). Usada pra inicializar o estado do dialog.
   */
  initialHiddenKeys: string[]
  /**
   * Custom fields do workspace passados como prop pra não depender de
   * `<CustomFieldStoreProvider>` (que só existe na inbox).
   */
  customFields: CustomFieldResource[]
}

export function CustomizeContactFieldsDialog({
  workspaceId,
  initialHiddenKeys,
  customFields,
}: Props) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  const customFieldsList = customFields

  // Map local: fieldKey -> visibility
  const [visibility, setVisibility] = useState<
    Record<string, ContactFieldVisibilityValue>
  >({})

  // Inicializa quando abre + quando lista de hidden muda externamente
  useEffect(() => {
    if (!open) {
      return
    }
    const next: Record<string, ContactFieldVisibilityValue> = {}
    for (const f of SYSTEM_FIELDS) {
      next[f.key] = initialHiddenKeys.includes(f.key)
        ? "alwaysHide"
        : "showAlways"
    }
    for (const cf of customFieldsList) {
      const k = cf.id.toString()
      next[k] = initialHiddenKeys.includes(k) ? "alwaysHide" : "showAlways"
    }
    setVisibility(next)
  }, [open, initialHiddenKeys, customFieldsList])

  const rows = useMemo(
    () => [
      ...SYSTEM_FIELDS.map((f) => ({
        key: f.key,
        label: t(f.labelKey as never) || f.key,
      })),
      ...customFieldsList.map((cf) => ({
        key: cf.id.toString(),
        label: cf.name,
      })),
    ],
    [customFieldsList, t],
  )

  const { execute, isPending } = useAction(
    updateContactFieldsVisibilityAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(
          t("contacts.visibility.saved") ?? "Visualização atualizada",
        )
        setOpen(false)
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const handleSave = () => {
    const items = rows.map((row) => ({
      fieldKey: row.key,
      visibility: visibility[row.key] ?? "showAlways",
    }))
    execute({ items })
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <SlidersHorizontalIcon />
          {t("contacts.visibility.customize") ?? "Personalizar visualização"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {t("contacts.visibility.title") ?? "Personalizar visualização"}
          </DialogTitle>
          <DialogDescription>
            {t("contacts.visibility.description") ??
              "Escolha quais campos de contato aparecem no painel direito do Inbox. A alteração será aplicada a todos os usuários do workspace."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto py-1">
          <div className="grid grid-cols-[1fr_180px] items-center px-1 pb-1 font-medium text-[12px] text-muted-foreground">
            <span>
              {t("contacts.visibility.fieldHeader") ?? "Campo de contato"}
            </span>
            <span>
              {t("contacts.visibility.visibilityHeader") ?? "Visibilidade"}
            </span>
          </div>

          {rows.map((row) => (
            <div
              className="grid grid-cols-[1fr_180px] items-center gap-2 rounded-md px-1 py-1.5 hover:bg-white/[0.04]"
              key={row.key}
            >
              <span className="truncate text-[14px]">{row.label}</span>
              <Select
                disabled={isPending}
                onValueChange={(v) =>
                  setVisibility((prev) => ({
                    ...prev,
                    [row.key]: v as ContactFieldVisibilityValue,
                  }))
                }
                value={visibility[row.key] ?? "showAlways"}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="showAlways">
                    {t("contacts.visibility.showAlways") ?? "Exibir sempre"}
                  </SelectItem>
                  <SelectItem value="alwaysHide">
                    {t("contacts.visibility.alwaysHide") ?? "Sempre ocultar"}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button
            disabled={isPending}
            onClick={() => setOpen(false)}
            type="button"
            variant="ghost"
          >
            {t("actions.cancel") ?? "Cancelar"}
          </Button>
          <Button disabled={isPending} onClick={handleSave} type="button">
            {t("actions.save") ?? "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
