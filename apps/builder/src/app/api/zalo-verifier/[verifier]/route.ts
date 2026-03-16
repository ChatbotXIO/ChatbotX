import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ verifier: string }> },
) {
  const { verifier } = await params

  // Validate that the verifier parameter exists and is not empty
  if (!verifier) {
    return new NextResponse("Verifier parameter is required", { status: 400 })
  }

  // Return the HTML with the verifier meta tag
  return new NextResponse(
    `
<!DOCTYPE html>
<html lang="en">

<head>
    <meta property="zalo-platform-site-verification" content="${verifier}" />
</head>

<body>
There Is No Limit To What You Can Accomplish Using Zalo!
</body>

</html>
    `,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html",
      },
    },
  )
}
