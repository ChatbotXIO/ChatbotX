"use client"

import Script from "next/script"

type FacebookPixelWindow = Window &
  typeof globalThis & {
    fbq?: (command: string, event: string, params?: object) => void
  }

/** Standard Pixel events the shop reports. */
export type PixelEvent =
  | "ViewContent"
  | "AddToCart"
  | "InitiateCheckout"
  | "Purchase"

/** Reports `event` when the store set a Pixel; a no-op otherwise. */
export function trackPixel(event: PixelEvent, params?: object) {
  ;(window as FacebookPixelWindow).fbq?.("track", event, params)
}

// Only digits reach the inline script.
const PIXEL_ID_PATTERN = /^\d{5,20}$/

/** Loads the store's Facebook Pixel and reports the page view. */
export function FacebookPixel({ pixelId }: { pixelId: string | null }) {
  if (!(pixelId && PIXEL_ID_PATTERN.test(pixelId))) {
    return null
  }
  return (
    <Script id="webshop-facebook-pixel" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');fbq('track','PageView');`}
    </Script>
  )
}
