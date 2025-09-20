import { prisma } from "@aha.chat/database"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { z } from "zod"
import { env } from "@/env"

const webchatEmbedParams = z.object({
  webchatId: z.string().cuid2(),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ webchatId: string }> },
) {
  try {
    const { webchatId } = webchatEmbedParams.parse(await params)

    const webchat = await prisma.integrationWebchat.findFirst({
      where: {
        id: webchatId,
        enable: true,
      },
      include: {
        chatbot: true,
      },
    })

    if (!webchat) {
      return new NextResponse("Webchat not found", { status: 404 })
    }

    // Check if the request is from an authorized domain
    const referer = req.headers.get("referer")
    if (referer) {
      const refererUrl = new URL(referer)
      const refererDomain = refererUrl.hostname

      const isAuthorized = webchat.authorizedDomains.some((domain) => {
        try {
          const authorizedUrl = new URL(domain)
          return authorizedUrl.hostname === refererDomain
        } catch {
          return false
        }
      })

      if (!isAuthorized) {
        return new NextResponse("Domain not authorized", { status: 403 })
      }
    }

    const baseUrl = env.NEXT_PUBLIC_BUILDER_URL

    const embedScript = `
(function() {
  'use strict';
  
  // Prevent multiple initializations
  if (window.AhaChatWidget) {
    return;
  }
  
  window.AhaChatWidget = {
    init: function(config) {
      const widgetConfig = {
        chatbotId: '${webchat.chatbotId}',
        webchatId: '${webchatId}',
        baseUrl: '${baseUrl}',
        ...config
      };

      console.log('widgetConfig', widgetConfig);
      
      // Create widget container
      const widgetContainer = document.createElement('div');
      widgetContainer.id = 'aha-chat-widget';
      document.body.appendChild(widgetContainer);
      
      // Load React and dependencies
      const loadScript = (src) => {
        return new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = src;
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      };
      
      const loadStylesheet = (href) => {
        return new Promise((resolve, reject) => {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = href;
          link.onload = resolve;
          link.onerror = reject;
          document.head.appendChild(link);
        });
      };
      
      // Load required dependencies
      Promise.all([
        loadScript('https://esm.sh/react@19'),
        loadScript('https://esm.sh/react-dom@19'),
        loadStylesheet('${baseUrl}/api/webchat/embed/${webchatId}/styles.css')
      ]).then(() => {
        // Load the widget component
        fetch('${baseUrl}/api/webchat/embed/${webchatId}/widget.js')
          .then(response => response.text())
          .then(script => {
            // Execute the widget script
            eval(script);
          })
          .catch(error => {
            console.error('Failed to load Aha Chat widget:', error);
          });
      }).catch(error => {
        console.error('Failed to load Aha Chat dependencies:', error);
      });
    }
  };
  
  // Auto-initialize if config is provided
  if (window.AhaChatConfig) {
    window.AhaChatWidget.init(window.AhaChatConfig);
  }
})();
`

    return new NextResponse(embedScript, {
      headers: {
        "Content-Type": "application/javascript",
        "Cache-Control": "public, max-age=3600",
      },
    })
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: Error logging
    console.error("Error generating embed script:", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
