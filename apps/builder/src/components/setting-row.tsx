import { Label } from "@aha.chat/ui/components/ui/label"
import type { ReactElement } from "react"

type SettingRowProps = {
  label: string
  description: string
  readMoreUrl?: string
  children: ReactElement
}

export const SettingRow = (props: SettingRowProps) => {
  const { label, description, children } = props
  return (
    <div className="grid grid-cols-4 gap-4">
      <Label>{label}</Label>
      <div>{children}</div>
      {description && (
        <p className="wrap-break-word col-span-2 text-muted-foreground text-sm">
          {description}
        </p>
      )}
    </div>
  )
}
