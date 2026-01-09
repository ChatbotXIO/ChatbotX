import type { OrganizationSettings } from "@aha.chat/database/types"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import { SiWhatsapp, SiWhatsappHex } from "@icons-pack/react-simple-icons"
import EditWhatsappAppDialog from "./edit-whatsapp-app"

type WhatsappAppCardProps = {
  settings: OrganizationSettings
}

export default function WhatsappAppCard({ settings }: WhatsappAppCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2">
            <SiWhatsapp fill={SiWhatsappHex} />
            <CardTitle>Whatsapp</CardTitle>
          </div>

          <EditWhatsappAppDialog triggerClassName="self-end" />
        </div>
        <CardDescription>
          Configure your Whatsapp app to connect your business to WhatsApp.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {settings.whatsapp && (
          <div className="flex flex-col gap-2">
            <p>App ID: {settings.whatsapp.clientId}</p>
            <p>Webhook Verify Token: {settings.whatsapp.verifyToken}</p>
            <p>Version: {settings.whatsapp.version}</p>
            <p>Config ID: {settings.whatsapp.configId}</p>
          </div>
        )}
        {!settings.whatsapp && (
          <div className="flex flex-col gap-2">
            <p>No Whatsapp app configured</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
