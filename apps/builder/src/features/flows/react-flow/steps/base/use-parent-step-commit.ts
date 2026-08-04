import { useCallback } from "react"
import { useFormContext } from "react-hook-form"

/**
 * Commit a nested step editor's values back into the parent flow-step form.
 *
 * A step editor (Set Custom Field, Coupon, Call API, …) runs its own isolated
 * form and, on save, writes the result into the parent step. React Hook Form's
 * `setValue` updates a field silently by default, but the parent form (e.g. the
 * Edit Button dialog) gates its Confirm button on `formState.isValid` — so a
 * write that skips revalidation leaves Confirm disabled until a remount.
 * Centralizing the write here guarantees every editor re-runs the parent's
 * validation and cannot drift from that contract again.
 *
 * The returned `commit` merges a partial patch over the current step value, so
 * fields the editor does not manage — `id`, `stepType`, success/error `states`
 * — are preserved untouched.
 */
export function useParentStepCommit<TStep extends object>(parentName: string) {
  const { setValue, getValues } = useFormContext()

  return useCallback(
    (patch: Partial<TStep>) => {
      const current = getValues(parentName) as TStep
      setValue(
        parentName,
        { ...current, ...patch },
        { shouldDirty: true, shouldValidate: true },
      )
    },
    [getValues, setValue, parentName],
  )
}
