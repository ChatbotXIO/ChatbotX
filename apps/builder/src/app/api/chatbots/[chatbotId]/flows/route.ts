import { NextResponse } from "next/server"

export async function GET(
  // req: NextRequest,
  // { params }: { params: Promise<{ chatbotId: string }> },
) {
  return NextResponse.json({
    data: [],
    pageCount: 0,
  })
}
