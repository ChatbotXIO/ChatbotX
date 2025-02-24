"use client"

import Script from "next/script"
import { useEffect } from "react"

export default function WhatsappConnect() {
  useEffect(() => {
    if (window.FB) {
      window.FB.init({
        appId: "1813998512688059",
        cookie: true,
        xfbml: true,
        version: "v21.0",
      })

      windowFB.getLoginStatus((response) => {
        console.log("ffffffff", response)
      })
    }
  }, [])

  return (
    <>
      <Script
        src="https://connect.facebook.net/en_US/sdk.js"
        strategy="lazyOnload"
        onLoad={() => console.log("loaded facebook sdk")}
      />
    </>
  )
}
