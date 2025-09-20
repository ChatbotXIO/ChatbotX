export function GET(_req: Request) {
  const css = `
.ahc-iframe {
  width: 350px;
  max-width: 100vh;
  height: 500px;
  max-height: 100vh;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}
  `
  return new Response(css, {
    headers: {
      "Content-Type": "text/css",
    },
  })
}
