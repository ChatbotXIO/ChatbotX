import { prisma } from "@aha.chat/database"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { z } from "zod"

const webchatEmbedParams = z.object({
  webchatId: z.string().cuid2(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ webchatId: string }> },
) {
  try {
    const { webchatId } = webchatEmbedParams.parse(await params)

    const webchat = await prisma.integrationWebchat.findFirst({
      where: {
        id: webchatId,
        enable: true,
      },
    })

    if (!webchat) {
      return new NextResponse("Webchat not found", { status: 404 })
    }

    const customCss = webchat.customCss || ""

    const styles = `
/* Aha Chat Widget Styles */
#aha-chat-widget * {
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
}

#aha-chat-widget {
  font-size: 14px;
  line-height: 1.5;
}

#aha-chat-widget button {
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
}

#aha-chat-widget input {
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
}

#aha-chat-widget button:focus,
#aha-chat-widget input:focus {
  outline: 2px solid ${webchat.brandColor}40;
  outline-offset: 2px;
}

#aha-chat-widget button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

#aha-chat-widget input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Custom styles from webchat configuration */
${customCss}
`

    return new NextResponse(styles, {
      headers: {
        "Content-Type": "text/css",
        "Cache-Control": "public, max-age=3600",
      },
    })
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: Error logging
    console.error("Error generating styles:", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
