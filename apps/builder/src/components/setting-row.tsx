import { cn } from "@/lib/utils"
import { useTranslate } from "@tolgee/react"
import Link from "next/link"
import type { ReactElement } from "react"

export const SettingRow = ({
  label,
  description,
  readMoreUrl,
  className,
  children,
}: {
  label: ReactElement
  description: ReactElement
  className?: string
  readMoreUrl?: string
  children: ReactElement
}) => {
  const { t } = useTranslate()
  return (
    <div className={cn("grid grid-cols-2 gap-3", className)}>
      <div>
        <h4 className="font-medium">{label}</h4>
        <div>
          {description}
          {readMoreUrl && (
            <Link href={readMoreUrl}>{t("common.readMore")}</Link>
          )}
        </div>
      </div>

      <div>{children}</div>
    </div>
  )
}
