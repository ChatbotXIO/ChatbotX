import type { ReactNode } from "react"
import { WhatsappSettingTabs } from "@/features/integration-whatsapp/components/whatsapp-setting-tabs"

type LayoutProps = {
  children: ReactNode
}

export default function WhatsappLayout({ children }: LayoutProps) {
  return (
    <>
      <WhatsappSettingTabs />

      <div>{children}</div>
    </>
  )
}
