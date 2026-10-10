"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { CopyIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useId } from "react"
import { useClipboard } from "@/hooks/use-clipboard"

// Same rule the validator applies to input names.
const VALID_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * Read-only `${screen.ID.form.key}` for the selected input, with a copy
 * button — the syntax that shows this answer in text or a condition.
 */
export function AnswerReferenceField({
  screenId,
  fieldKey,
}: {
  screenId: string
  fieldKey: unknown
}) {
  const t = useTranslations("miniApps.inspector")
  const inputId = useId()
  const { handleCopy } = useClipboard()
  if (!(typeof fieldKey === "string" && VALID_KEY.test(fieldKey))) {
    return null
  }
  const reference = `\${screen.${screenId}.form.${fieldKey}}`

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId}>{t("answerReference")}</Label>
      <div className="flex items-center gap-1">
        <Input
          className="font-mono text-xs"
          id={inputId}
          onFocus={(event) => event.target.select()}
          readOnly
          value={reference}
        />
        <Button
          aria-label={t("copyReference")}
          onClick={() => handleCopy(reference)}
          size="icon"
          type="button"
          variant="outline"
        >
          <CopyIcon className="size-4" />
        </Button>
      </div>
      <span className="text-muted-foreground text-xs">
        {t("answerReferenceHint")}
      </span>
    </div>
  )
}
