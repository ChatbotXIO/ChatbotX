import { Label } from "@chatbotx.io/ui/components/ui/label"
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
    <div className="grid grid-cols-4 items-start gap-4">
      <div className="flex flex-col gap-1.5">
        <Label>{label}</Label>
      </div>
      <div>{children}</div>
      {description && (
        <p className="wrap-break-words col-span-2 text-muted-foreground text-sm">
          {description}
        </p>
      )}
    </div>
  )
}
