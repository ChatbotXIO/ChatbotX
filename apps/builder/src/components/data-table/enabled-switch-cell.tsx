"use client"

import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { useRouter } from "next/navigation"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"

type EnabledToggleAction = (input: { enabled: boolean }) => Promise<unknown>

/**
 * Shared "enabled" toggle cell for data tables — was copy-pasted verbatim
 * between the minigames and dynamic-images tables. `action` must already be
 * bound to its row-scoped args (e.g. `enableMinigameAction.bind(null,
 * workspaceId, id)`) and accept `{ enabled: boolean }` as its remaining
 * input. The casts below bridge our simplified external contract with
 * `useAction`'s generic-over-schema type, which can't be named here since
 * next-safe-action doesn't publicly export its `StandardSchemaV1` type.
 */
export function EnabledSwitchCell(props: {
  checked: boolean
  action: EnabledToggleAction
}) {
  const router = useRouter()

  const { execute, isPending } = useAction(
    props.action as Parameters<typeof useAction>[0],
    {
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError as string)
        }
      },
      onSuccess: () => {
        router.refresh()
      },
    },
  )

  return (
    <Switch
      checked={props.checked}
      disabled={isPending}
      onCheckedChange={(value) =>
        (execute as (input: { enabled: boolean }) => void)({ enabled: value })
      }
    />
  )
}
