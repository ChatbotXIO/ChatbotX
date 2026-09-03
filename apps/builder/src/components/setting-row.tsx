import { Label } from "@chatbotx.io/ui/components/ui/label"
import type { ReactElement, ReactNode } from "react"

type SettingRowProps = {
  label: string
  description?: ReactNode
  readMoreUrl?: string
  children: ReactElement
}

export const SettingRow = (props: SettingRowProps) => {
  const { label, description, children } = props
  return (
    // A four-column split is unreadable on a phone: label, control and
    // description each end up a sliver wide. Stack them instead, and restore
    // the desktop split from `md` up.
    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-4">
      <div className="mt-2 flex flex-col gap-1.5">
        <Label>{label}</Label>
      </div>
      <div>{children}</div>
      {description && (
        <div className="wrap-break-words mt-1.5 flex flex-col gap-2 text-muted-foreground text-sm md:col-span-2">
          {description}
        </div>
      )}
    </div>
  )
}
