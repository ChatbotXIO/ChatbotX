import type { OrganizationSettings } from "@aha.chat/database/types"
import WhatsappAppCard from "./components/whatsapp-app-card"

type AdminIntegrationsDetailProps = {
  settings: OrganizationSettings
}

export default function AdminIntegrationsDetail({
  settings,
}: AdminIntegrationsDetailProps) {
  return (
    <div className="grid grid-cols-auto gap-4 md:grid-cols-2">
      <WhatsappAppCard settings={settings} />
    </div>
  )
}
