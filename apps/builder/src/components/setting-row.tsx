import { T } from "@tolgee/react"
import Link from "next/link"
import type { ReactElement } from "react"

export const SettingRow = ({
  label,
  description,
  readMoreUrl,
  children,
}: {
  label: string
  description: string
  readMoreUrl?: string
  children: ReactElement
}) => {
  return (
    <div className="flex flex-wrap">
      <h4 className="font-medium truncate w-1/3 px-2 pt-1.5 lg:w-3/12">
        {label}
      </h4>
      <div className="w-2/3 px-2 lg:w-4/12">{children}</div>
      <div className="w-full lg:w-5/12 px-2 pt-1.5">
        {description}
        {readMoreUrl && (
          <Link href={readMoreUrl}>
            <T keyName="common.readMore" />
          </Link>
        )}
      </div>
    </div>
  )
}
