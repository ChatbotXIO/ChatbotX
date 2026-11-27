"use client"

import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import {
  type HookCallbacks,
  type HookSafeActionFn,
  useAction,
} from "next-safe-action/hooks"
import { toastActionError } from "./action-error-toast"

/**
 * The input-schema bound `useAction` accepts. next-safe-action does not
 * export its `StandardSchemaV1`, so it is read off `useAction` itself.
 */
type ActionSchema =
  Parameters<typeof useAction>[0] extends HookSafeActionFn<
    infer _ServerError,
    infer Schema,
    infer _ShapedErrors,
    infer _Data
  >
    ? Schema
    : never

type RefreshingActionOptions<
  ServerError,
  Schema extends ActionSchema,
  ShapedErrors,
  Data,
> = {
  /** Runs before the page refreshes (toasts, cache invalidation). */
  onSuccess?: HookCallbacks<
    ServerError,
    Schema,
    ShapedErrors,
    Data
  >["onSuccess"]
}

/**
 * `useAction` for the installer-side actions: a server error becomes a toast
 * and a success refreshes the server component tree. Pass the action already
 * bound to its row-scoped args (`someAction.bind(null, workspaceId, id)`).
 */
export function useRefreshingAction<
  ServerError,
  Schema extends ActionSchema,
  ShapedErrors,
  Data,
>(
  bound: HookSafeActionFn<ServerError, Schema, ShapedErrors, Data>,
  options: RefreshingActionOptions<
    ServerError,
    Schema,
    ShapedErrors,
    Data
  > = {},
) {
  const router = useRouter()
  const t = useTranslations()
  const { execute, isPending } = useAction(bound, {
    onSuccess: async (args) => {
      await options.onSuccess?.(args)
      router.refresh()
    },
    onError: ({ error }) => toastActionError(error, t("messages.unknownError")),
  })
  return { execute, isPending }
}
