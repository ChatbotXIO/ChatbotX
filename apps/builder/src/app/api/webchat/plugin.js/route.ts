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

  const widgetCSSLink = document.createElement("link");
  widgetCSSLink.href = "${env.NEXT_PUBLIC_BUILDER_URL}/webchat/plugin.css";
  widgetCSSLink.type = "text/css";
  widgetCSSLink.rel = "stylesheet";
  widgetCSSLink.media = "screen,print";
  document.getElementsByTagName("head")[0].appendChild(widgetCSSLink);

  const ahachatWidget = {
    wrapper: null,
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

      ahachatWidget.wrapper = '<div class="ahc-wrapper"></div>';
      ahachatWidget.floatButton = '<button type="button" class="ahc-trigger open"><img src="${env.NEXT_PUBLIC_BUILDER_URL}/icons/bot.webp" alt="chatbot"></button>';
      ahachatWidget.floatHtml = '<iframe id="ahc-iframe" src="' + url.toString() +'" class="ahc-iframe"></iframe>';

      appendHtml(document.body, ahachatWidget.wrapper);
      appendHtml(document.getElementsByClassName('ahc-wrapper')[0], ahachatWidget.floatButton);
      appendHtml(document.getElementsByClassName('ahc-wrapper')[0], ahachatWidget.floatHtml);

      ahachatWidget.createEvents();
    },
    createEvents: () => {
      const ahachatTrigger = document.getElementsByClassName('ahc-trigger')[0];
      const ahachatIframe = document.getElementsByClassName('ahc-iframe')[0];

      if (ahachatTrigger) {
        ahachatTrigger.addEventListener('click', function () {
        console.log('ahachatTrigger', ahachatTrigger);
        console.log('ahachatIframe', ahachatIframe);
          ahachatTrigger.classList.toggle('open');
          ahachatIframe.classList.toggle('open');
        });
      }

      window.addEventListener('message', function (message) {
        if (message.data.type === 'ahc.close') {
          ahachatTrigger.classList.toggle('open');
          ahachatIframe.classList.toggle('open');
        }
      });
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
