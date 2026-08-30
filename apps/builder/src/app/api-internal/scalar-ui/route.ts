import { NextResponse } from "next/server"

// Mirrors app/api/scalar-ui/route.ts but points at the internal, full-router
// spec. Dev-only — see app/api-internal/[[...rest]]/route.ts.
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const htmlContent = `
    <!doctype html>
    <html>
      <head>
        <title>ChatbotX (internal)</title>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/svg+xml" href="https://orpc.dev/icon.svg" />
      </head>
      <body>
        <div id="app"></div>

        <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
        <script>
          Scalar.createApiReference('#app', {
            url: '/api-internal',
            authentication: {
              securitySchemes: {
                bearerAuth: {
                  token: 'default-token',
                },
                developerAccessToken: {
                  token: 'default-workspace-token',
                },
              },
            },
          })
        </script>
      </body>
    </html>
  `

  return await new Response(htmlContent, {
    headers: {
      "Content-Type": "text/html",
    },
  })
}
