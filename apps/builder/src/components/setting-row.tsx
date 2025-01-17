import { useTranslate } from "@tolgee/react"
import Link from "next/link"
import type { ReactElement } from "react"

export const SettingRow = ({
  label,
  description,
  readMoreUrl,
  children,
}: {
  label: ReactElement
  description: ReactElement
  readMoreUrl?: string
  children: ReactElement
}) => {
  const { t } = useTranslate()
  return (
    <div className="grid grid-flow-col gap-2">
      <h4 className="font-medium">{label}</h4>
      <div>{children}</div>
      <div>
        {description}
        {readMoreUrl && <Link href={readMoreUrl}>{t("common.readMore")}</Link>}
      </div>
    </div>
  )
}
