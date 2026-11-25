"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { ORPCError } from "@orpc/client"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { ProviderNetworkIcon } from "@/features/social-accounts/components/provider-avatar"
import { orpc } from "@/lib/orpc/query"
import { PROVIDER_LABELS } from "../lib/composer-state"
import type { PublishDestinationGroup } from "../lib/publish-destination-options"

type EditableSet = { destinations: { id: string }[]; id: string; name: string }

/**
 * Renames a saved set and chooses its members among every destination of the
 * workspace. A set keeps at least one destination.
 */
export const TargetSetEditor = ({
  groups,
  onDone,
  set,
  workspaceId,
}: {
  groups: readonly PublishDestinationGroup[]
  onDone: () => void
  set: EditableSet
  workspaceId: string
}) => {
  const t = useTranslations()
  const queryClient = useQueryClient()
  const [name, setName] = useState(set.name)
  const [members, setMembers] = useState<ReadonlySet<string>>(
    () => new Set(set.destinations.map((destination) => destination.id)),
  )
  const update = useMutation(
    orpc.postSnippetsAPIs.privateUpdatePostTargetSetAPI.mutationOptions({
      onError: (error) =>
        toast.error(
          error instanceof ORPCError && error.code === "targetSetNameTaken"
            ? t("composer.targetSetsNameTaken")
            : error.message,
        ),
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpc.postSnippetsAPIs.privateListPostTargetSetsAPI.key(),
        })
        toast.success(t("composer.targetSetsUpdated"))
        onDone()
      },
    }),
  )
  const trimmed = name.trim()
  const canSave = trimmed.length > 0 && members.size > 0 && !update.isPending
  const toggle = (id: string) =>
    setMembers((current) => {
      const next = new Set(current)
      if (!next.delete(id)) {
        next.add(id)
      }
      return next
    })

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSave) {
          update.mutate({
            destinationIds: [...members],
            id: set.id,
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
        value={name}
      />
      <p className="px-1 text-muted-foreground text-xs">
        {t("composer.targetSetsMembers")}
      </p>
      <div className="max-h-48 space-y-2 overflow-y-auto">
        {groups
          .filter((group) => group.destinations.length > 0)
          .map((group) => (
            <fieldset className="space-y-1 border-0 p-0" key={group.provider}>
              <legend className="flex items-center gap-1.5 px-1 font-medium text-xs">
                <ProviderNetworkIcon decorative provider={group.provider} />
                {PROVIDER_LABELS[group.provider]}
              </legend>
              {group.destinations.map((destination) => (
                // biome-ignore lint/a11y/noLabelWithoutControl: the Checkbox renders the control
                <label
                  className="flex items-center gap-2 px-1 text-sm"
                  key={destination.id}
                >
                  <Checkbox
                    checked={members.has(destination.id)}
                    onCheckedChange={() => toggle(destination.id)}
                  />
                  <span className="min-w-0 truncate">{destination.name}</span>
                </label>
              ))}
            </fieldset>
          ))}
      </div>
      {members.size === 0 ? (
        <p className="px-1 text-destructive text-xs">
          {t("composer.targetSetsNeedsMember")}
        </p>
      ) : null}
      <div className="flex justify-end gap-1">
        <Button onClick={onDone} size="sm" type="button" variant="ghost">
          {t("actions.cancel")}
        </Button>
        <Button disabled={!canSave} size="sm" type="submit">
          {t("composer.targetSetsSave")}
        </Button>
      </div>
    </form>
  )
}
