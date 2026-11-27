import { useTranslations } from "next-intl"

/** Where the stored failure codes of an install and of a sync are translated. */
type ErrorNamespace = "templates.installs.errors" | "templates.sync.errors"

/**
 * Label for a stored failure code, for the install detail and the sync
 * history alike: the translation of the code when there is one, else the
 * namespace's `unknown` sentence, so a code added later never shows raw.
 * `const errorLabel = useErrorLabel("templates.sync.errors")` then
 * `errorLabel(sync.errorCode)`.
 */
export const useErrorLabel = (namespace: ErrorNamespace) => {
  const t = useTranslations(namespace)
  return (code: string | null | undefined): string =>
    code && t.has(code as never) ? t(code as never) : t("unknown")
}
