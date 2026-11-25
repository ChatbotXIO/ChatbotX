"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import type { PublishDestinationState } from "@chatbotx.io/utils/publish-destination"
import { ORPCError } from "@orpc/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2Icon, PencilIcon, Trash2Icon, UsersIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { orpc } from "@/lib/orpc/query"
import type { PublishDestinationGroup } from "../lib/publish-destination-options"
import { TargetSetEditor } from "./target-set-editor"

type TargetSetDestination = { id: string; state: PublishDestinationState }

/** The destinations of a set that can take a post now, and how many cannot. */
const splitReady = (destinations: readonly TargetSetDestination[]) => {
  const ready = destinations.filter((item) => item.state === "ready")
  return {
    readyIds: ready.map((item) => item.id),
    skipped: destinations.length - ready.length,
  }
}

/**
 * "Use set" makes the selection exactly the set's ready destinations (the
 * server reports each one's state, so a destination that needs reconnecting is
 * skipped and counted, never selected). "Save selection" stores the current
 * selection under a name.
 */
export const TargetSetPicker = ({
  disabled,
  groups,
  onToggle,
  selectedIds,
  workspaceId,
}: {
  disabled: boolean
  /** Every destination, for choosing the members of a set being edited. */
  groups: readonly PublishDestinationGroup[]
  onToggle: (destinationId: string) => void
  selectedIds: ReadonlySet<string>
  workspaceId: string
}) => {
  const t = useTranslations()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const sets = useQuery(
    orpc.postSnippetsAPIs.privateListPostTargetSetsAPI.queryOptions({
      enabled: open,
      input: { workspaceId },
    }),
  )
  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: orpc.postSnippetsAPIs.privateListPostTargetSetsAPI.key(),
    })
  }
  const onError = (error: Error) =>
    toast.error(
      error instanceof ORPCError && error.code === "targetSetNameTaken"
        ? t("composer.targetSetsNameTaken")
        : error.message,
    )
  const create = useMutation(
    orpc.postSnippetsAPIs.privateCreatePostTargetSetAPI.mutationOptions({
      onError,
      onSuccess: async () => {
        await refresh()
        setName("")
        toast.success(t("composer.targetSetsSaved"))
      },
    }),
  )
  const remove = useMutation(
    orpc.postSnippetsAPIs.privateDeletePostTargetSetAPI.mutationOptions({
      onError,
      onSuccess: async () => {
        await refresh()
        toast.success(t("composer.targetSetsDeleted"))
      },
    }),
  )

  const apply = (set: {
    destinations: TargetSetDestination[]
    name: string
  }) => {
    const { readyIds, skipped } = splitReady(set.destinations)
    const wanted = new Set(readyIds)
    for (const id of selectedIds) {
      if (!wanted.has(id)) {
        onToggle(id)
      }
    }
    for (const id of readyIds) {
      if (!selectedIds.has(id)) {
        onToggle(id)
      }
    }
    toast.success(t("composer.targetSetsApplied", { name: set.name }))
    if (skipped > 0) {
      toast.warning(t("composer.targetSetsSkipped", { count: skipped }))
    }
    setOpen(false)
  }
  const editing = sets.data?.items.find((set) => set.id === editingId)
  const trimmed = name.trim()
  const canSave =
    trimmed.length > 0 && selectedIds.size > 0 && !create.isPending

  return (
    <Popover
      onOpenChange={(next) => {
        setOpen(next)
        setEditingId(null)
      }}
      open={open}
    >
      <PopoverTrigger
        render={
          <Button disabled={disabled} size="sm" type="button" variant="outline">
            <UsersIcon />
            {t("composer.targetSets")}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-72 space-y-2 p-2">
        {editing ? (
          <TargetSetEditor
            groups={groups}
            key={editing.id}
            onDone={() => setEditingId(null)}
            set={editing}
            workspaceId={workspaceId}
          />
        ) : (
          <>
            {sets.isPending ? (
              <div className="flex justify-center py-3">
                <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : null}
            {sets.isError ? (
              <p className="px-1 text-destructive text-sm">
                {t("composer.targetSetsLoadFailed")}
              </p>
            ) : null}
            {sets.data?.items.length === 0 ? (
              <p className="px-1 text-muted-foreground text-sm">
                {t("composer.targetSetsEmpty")}
              </p>
            ) : null}
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {sets.data?.items.map((set) => (
                <li className="flex items-center gap-1" key={set.id}>
                  <Button
                    className="min-w-0 flex-1 justify-start"
                    onClick={() => apply(set)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <span className="truncate">{set.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {set.destinations.length}
                    </span>
                  </Button>
                  <Button
                    aria-label={t("actions.edit")}
                    onClick={() => setEditingId(set.id)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    aria-label={t("actions.delete")}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ id: set.id, workspaceId })}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2Icon />
                  </Button>
                </li>
              ))}
            </ul>
            <form
              className="flex gap-1 border-t pt-2"
              onSubmit={(event) => {
                event.preventDefault()
                if (canSave) {
                  create.mutate({
                    destinationIds: [...selectedIds],
                    name: trimmed,
                    workspaceId,
                  })
                }
              }}
            >
              <Input
                aria-label={t("composer.targetSetsName")}
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("composer.targetSetsNamePlaceholder")}
                value={name}
              />
              <Button disabled={!canSave} size="sm" type="submit">
                {t("composer.targetSetsSave")}
              </Button>
            </form>
            {selectedIds.size === 0 ? (
              <p className="px-1 text-muted-foreground text-xs">
                {t("composer.targetSetsNeedsSelection")}
              </p>
            ) : null}
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
