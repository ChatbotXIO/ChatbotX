import { GuestSessionStoreProvider } from "@/features/webchat/providers/store/guest-session-provider"
import { WebchatWrapper } from "@/features/webchat/webchat-wrapper"

export default function WebchatPage() {
  return (
    <GuestSessionStoreProvider>
      <WebchatWrapper />
    </GuestSessionStoreProvider>
  )
}
