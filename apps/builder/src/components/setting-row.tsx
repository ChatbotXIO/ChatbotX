import { cn } from "@/lib/utils"
import { useTranslate } from "@tolgee/react"
import Link from "next/link"
import type { ReactElement } from "react"

export const SettingRow = ({
  label,
  description,
  readMoreUrl,
  children,
  className,
}: {
  label: ReactElement
  description: ReactElement
  readMoreUrl?: string
  children: ReactElement
  className: string
}) => {
  const { t } = useTranslate()
  return (
    <div className={cn("flex flex-row gap-2", className)}>
      <h4 className="font-medium basis-3/12	truncate">{label}</h4>
      <div className="basis-3/12 truncate">{children}</div>
      <div className="basis-6/12 truncate">
        {description}
        {readMoreUrl && <Link href={readMoreUrl}>{t("common.readMore")}</Link>}
      </div>
    </div>
  )
}
