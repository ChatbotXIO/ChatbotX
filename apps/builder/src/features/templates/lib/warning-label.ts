type Translate = {
  (key: string, values?: Record<string, string>): string
  has: (key: string) => boolean
}

/**
 * The translated text for an install warning code. Codes from the install
 * itself have their own message; an unresolved reference carries the name of
 * the reference kind (`sequence`, `aiAgent`, ...), which has none, so it falls
 * back to a message that shows the code instead of a bare English identifier.
 */
export const warningLabel = (t: Translate, code: string): string =>
  t.has(`templates.warningCodes.${code}`)
    ? t(`templates.warningCodes.${code}`)
    : t("templates.warningCodes.unlisted", { code })
