"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import {
  createMetaCatalogAction,
  listMetaCatalogBusinessesAction,
} from "../actions/meta-catalog.action"

type Business = { id: string; name?: string }

/**
 * Creating a catalog is a write to the user's Business Manager, so it never
 * happens as a side effect of leaving the ID field blank — the panel names the
 * Business and the catalog first and waits for an explicit confirmation.
 */
export function MetaCatalogCreatePanel({
  workspaceId,
  onCreated,
}: {
  workspaceId: string
  onCreated: (catalogId: string) => void
}) {
  const t = useTranslations("metaCatalog.createCatalog")
  const tActions = useTranslations("actions")
  const [isOpen, setIsOpen] = useState(false)
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [businessId, setBusinessId] = useState("")
  const [name, setName] = useState("")

  const loadBusinesses = useAction(
    listMetaCatalogBusinessesAction.bind(null, workspaceId),
    {
      onSuccess: ({ data }) => {
        if (!data) {
          return
        }
        setBusinesses(data.businesses)
        setName((current) => current || data.suggestedName)
        // One Business Manager is the common case; preselecting it turns the
        // panel into a single confirm click.
        if (data.businesses.length === 1) {
          setBusinessId(data.businesses[0].id)
        }
        setIsOpen(true)
      },
      onError: toastActionError(t("errors.businesses")),
    },
  )

  const create = useAction(createMetaCatalogAction.bind(null, workspaceId), {
    onSuccess: ({ data }) => {
      if (!data?.catalogId) {
        return
      }
      toast.success(t("created"))
      setIsOpen(false)
      onCreated(data.catalogId)
    },
    onError: toastActionError(t("errors.create")),
  })

  if (!isOpen) {
    return (
      <Button
        className="w-fit px-0"
        disabled={loadBusinesses.isPending}
        onClick={() => loadBusinesses.execute()}
        size="sm"
        type="button"
        variant="link"
      >
        {loadBusinesses.isPending ? (
          <Loader2Icon className="animate-spin" />
        ) : (
          <PlusIcon />
        )}
        {t("trigger")}
      </Button>
    )
  }

  return (
    <div className="grid gap-3 rounded-lg border bg-muted/40 p-3">
      <p className="text-muted-foreground text-sm">{t("description")}</p>

      {businesses.length === 0 ? (
        <p className="text-destructive text-sm">{t("noBusinesses")}</p>
      ) : (
        <div className="grid gap-2">
          <Label htmlFor="meta-catalog-business">{t("business")}</Label>
          <Select
            items={businesses.map((business) => ({
              label: business.name ?? business.id,
              value: business.id,
            }))}
            onValueChange={(value) => setBusinessId(value as string)}
            value={businessId}
          >
            <SelectTrigger className="w-full" id="meta-catalog-business">
              <SelectValue placeholder={t("businessPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {businesses.map((business) => (
                <SelectItem key={business.id} value={business.id}>
                  {business.name ?? business.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor="meta-catalog-name">{t("name")}</Label>
        <Input
          id="meta-catalog-name"
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
          value={name}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button
          onClick={() => setIsOpen(false)}
          size="sm"
          type="button"
          variant="ghost"
        >
          {tActions("cancel")}
        </Button>
        <Button
          disabled={!(businessId && name.trim()) || create.isPending}
          onClick={() => create.execute({ businessId, name: name.trim() })}
          size="sm"
          type="button"
        >
          {create.isPending ? <Loader2Icon className="animate-spin" /> : null}
          {t("confirm")}
        </Button>
      </div>
    </div>
  )
}
