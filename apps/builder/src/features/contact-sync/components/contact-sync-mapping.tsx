"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangleIcon, Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { useCustomFields } from "@/features/custom-fields/provider/custom-field-hook"
import { useTags } from "@/features/tags/provider/tag-hook"
import { orpc } from "@/lib/orpc/query"
import { saveContactSyncMappingsAction } from "../actions/contact-sync.action"

/** The "match by name automatically" choice; any other value is a target id. */
const AUTO = "auto"

type Draft = { tags: Record<string, string>; fields: Record<string, string> }

function TargetSelect({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  ariaLabel: string
}) {
  const t = useTranslations()
  const items = [
    { value: AUTO, label: t("contactSync.mapping.auto") },
    ...options,
  ]
  return (
    <Select
      items={items}
      onValueChange={(next) => onChange(next ? String(next) : AUTO)}
      value={value}
    >
      <SelectTrigger aria-label={ariaLabel} className="w-full sm:w-64">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * Per-source tag and custom-field mapping (source → workspace). Only fields
 * of a compatible type are offered; a stored mapping of another type is
 * flagged, since its values are skipped at sync time.
 */
export function ContactSyncMapping({
  workspaceId,
  inboxId,
}: {
  workspaceId: string
  inboxId: string
}) {
  const t = useTranslations()
  const queryClient = useQueryClient()
  const schemaQuery = useQuery(
    orpc.contactSyncAPIs.getSchema.queryOptions({
      input: { workspaceId, inboxId },
    }),
  )
  const { data: tags = [] } = useTags(workspaceId)
  const { data: customFields = [] } = useCustomFields(workspaceId)
  const [draft, setDraft] = useState<Draft>({ tags: {}, fields: {} })

  const save = useAction(
    saveContactSyncMappingsAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(t("contactSync.mapping.saved"))
        setDraft({ tags: {}, fields: {} })
        queryClient.invalidateQueries({
          queryKey: orpc.contactSyncAPIs.getSchema.key(),
        })
      },
      onError: ({ error }) => {
        toast.error(
          error.validationErrors?._errors?.[0] ??
            error.serverError ??
            t("contactSync.errors.generic"),
        )
      },
    },
  )

  if (schemaQuery.isPending) {
    return (
      <Loader2Icon className="mx-auto my-4 size-5 animate-spin text-muted-foreground" />
    )
  }
  if (schemaQuery.isError) {
    return (
      <p className="text-destructive text-sm">
        {t("contactSync.errors.generic")}
      </p>
    )
  }

  const schema = schemaQuery.data
  const tagOptions = tags.map((tag) => ({ value: tag.id, label: tag.name }))
  const isDirty =
    Object.keys(draft.tags).length > 0 || Object.keys(draft.fields).length > 0

  const submit = () =>
    save.execute({
      inboxId,
      tags: Object.entries(draft.tags).map(([externalId, value]) => ({
        externalId,
        target: value === AUTO ? null : { tagId: value },
      })),
      fields: Object.entries(draft.fields).map(([externalId, value]) => ({
        externalId,
        target: value === AUTO ? null : { customFieldId: value },
      })),
    })

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h4 className="font-medium text-sm">{t("contactSync.mapping.tags")}</h4>
        {schema.tags.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("contactSync.mapping.noTags")}
          </p>
        ) : (
          schema.tags.map((tag) => (
            <div
              className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
              key={tag.id}
            >
              <span className="truncate text-sm">{tag.name}</span>
              <TargetSelect
                ariaLabel={tag.name}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    tags: { ...current.tags, [tag.id]: value },
                  }))
                }
                options={tagOptions}
                value={draft.tags[tag.id] ?? tag.mapping?.tagId ?? AUTO}
              />
            </div>
          ))
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h4 className="font-medium text-sm">
          {t("contactSync.mapping.fields")}
        </h4>
        {schema.fields.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("contactSync.mapping.noFields")}
          </p>
        ) : (
          schema.fields.map((field) => {
            const compatible = new Set<string>(field.compatibleTargetTypes)
            const options = customFields
              .filter((customField) => compatible.has(customField.type))
              .map((customField) => ({
                value: customField.id,
                label: customField.name,
              }))
            const chosen = draft.fields[field.id]
            const showMismatch = !chosen && field.mapping?.typeMismatch
            return (
              <div className="flex flex-col gap-1" key={field.id}>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="truncate text-sm">
                    {field.name} <Badge variant="outline">{field.type}</Badge>
                  </span>
                  <TargetSelect
                    ariaLabel={field.name}
                    onChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        fields: { ...current.fields, [field.id]: value },
                      }))
                    }
                    options={options}
                    value={chosen ?? field.mapping?.customFieldId ?? AUTO}
                  />
                </div>
                {showMismatch && (
                  <p className="flex items-center gap-1 text-amber-700 text-xs dark:text-amber-400">
                    <AlertTriangleIcon className="size-3.5" />
                    {t("contactSync.mapping.typeMismatch")}
                  </p>
                )}
              </div>
            )
          })
        )}
      </section>

      <div className="flex justify-end">
        <Button
          disabled={!isDirty || save.isPending}
          onClick={submit}
          size="sm"
          variant="outline"
        >
          {save.isPending && <Loader2Icon className="animate-spin" />}
          {t("contactSync.mapping.save")}
        </Button>
      </div>
    </div>
  )
}
