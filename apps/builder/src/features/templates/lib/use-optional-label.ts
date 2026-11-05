import { useTranslations } from "next-intl"

/**
 * Label for a value that may or may not have a translation (a status, channel
 * or category added later): the translation when the key exists, the raw
 * value otherwise. `const label = useOptionalLabel("templates.channels")`
 * then `label(channel)`.
 */
export const useOptionalLabel = (
  namespace: Parameters<typeof useTranslations>[0],
) => {
  const t = useTranslations(namespace)
  return (key: string): string => (t.has(key as never) ? t(key as never) : key)
}
