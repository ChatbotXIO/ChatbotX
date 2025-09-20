import { NextResponse } from "next/server"
import { env } from "@/env"

export function GET() {
  const embedScript = `
(function () {
  'use strict';

  // Prevent multiple initializations
  if (window.AhaChatWidget) {
    return;
  }

  let ahaChatButton = null;


  const ahachatWidget = {
    floatButton: null,
    floatHtml: null,
    init: function (config) {
      const url = new URL("/webchat", window.location.href ?? config.url);

      if (config.chatbotId) {
        url.searchParams.set('chatbotId', config.chatbotId);
      }
      if (config.webchatId) {
        url.searchParams.set('webchatId', config.webchatId);
      }
      if (config.hideHeader) {
        url.searchParams.set('hideHeader', config.hideHeader);
      }
      if (config.showLogo) {
        url.searchParams.set('showLogo', config.showLogo);
      }
      if (config.hideMessageInput) {
        url.searchParams.set('hideMessageInput', config.hideMessageInput);
      }
      if (config.brandColor) {
        url.searchParams.set('brandColor', config.brandColor);
      }

      url.searchParams.set("domain", window.location.hostname);

      console.log('url', url.toString());

      ahachatWidget.floatButton = '<button type="button" class="ahc-btn"><img src="${env.NEXT_PUBLIC_BUILDER_URL}/brand/logo.svg" alt="chatbot"></button>';
      ahachatWidget.floatHtml = '<div class="ahc-iframe"><iframe id="ahc-iframe" data-src="' + url.toString() +'" class="ahc-iframe"></iframe></div>';

      appendHtml(document.body, ahachatWidget.floatButton);
      appendHtml(document.body, ahachatWidget.floatHtml);
    }
  };

  window.ahachatWidget = ahachatWidget;

  function appendHtml(el, str) {
    var div = document.createElement('div');
    div.innerHTML = str;
    while (div.children.length > 0) {
      el.appendChild(div.children[0]);
    }
  }
})();
  `

  return new NextResponse(embedScript, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=3600",
    },
  })
}
