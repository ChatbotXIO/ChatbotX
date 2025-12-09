import { useEffect } from "react"
import type { UseFormReturn } from "react-hook-form"

export function TriggerFormInitially({
  form,
}: {
  // biome-ignore lint/suspicious/noExplicitAny: safe ignore
  form: UseFormReturn<any, any, any>
}) {
  const { trigger } = form

  useEffect(() => {
    trigger()
  }, [trigger])

  return null
}
