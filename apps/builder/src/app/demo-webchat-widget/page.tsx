"use client"

import Script from "next/script"
import { env } from "@/env"

export default function DemoWebchatEmbedPage() {
  return (
    <div>
      <h1>Demo Webchat Embed</h1>
      <Script
        onLoad={() => {
          window.ahachatWidget.init({
            chatbotId: "hhtcd8n86igecbwt60p4zvmh",
            webchatId: "k79wuibbzvgkfyu34ilwno42",
            hideHeader: true,
            showLogo: false,
            hideMessageInput: true,
          })
        }}
        src={`${env.NEXT_PUBLIC_BUILDER_URL}/api/webchat/plugin.js`}
      />
    </div>
  )
}
