export async function GET() {
  const htmlContent = `
    <!doctype html>
    <html>
      <head>
        <title>My Client</title>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/svg+xml" href="https://orpc.dev/icon.svg" />
      </head>
      <body>
        <div id="app"></div>

        <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
        <script>
          Scalar.createApiReference('#app', {
            url: '/api/public-spec.json',
            authentication: {
              securitySchemes: {
                bearerAuth: {
                  token: 'default-token',
                },
                chatbotToken: {
                  token: 'default-chatbot-token',
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
