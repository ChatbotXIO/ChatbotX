import { T } from "@tolgee/react"
import Link from "next/link"
import type { ReactElement } from "react"

type SettingRowProps = {
  label: string
  description: string
  readMoreUrl?: string
  children: ReactElement
}

export const SettingRow = (props: SettingRowProps) => {
  const { label, description, readMoreUrl, children } = props

  return (
    <div className="flex flex-wrap">
      <h4 className="w-1/3 truncate px-2 pt-1.5 font-medium lg:w-3/12">
        {label}
      </h4>
      <div className="w-2/3 px-2 lg:w-4/12">{children}</div>
      <div className="w-full px-2 pt-1.5 lg:w-5/12">
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
