import { useEffect } from "react"
import type { UseFormReturn } from "react-hook-form"

export function TriggerFormInitially({
  form,
}: {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  form: UseFormReturn<any, any, any>
}) {
  const { trigger } = form

  useEffect(() => {
    trigger()
  }, [trigger])

  return null
}
