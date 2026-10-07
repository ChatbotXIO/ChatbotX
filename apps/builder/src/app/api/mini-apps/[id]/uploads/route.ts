import {
  MiniAppUploadError,
  miniAppService,
  miniAppUploadService,
} from "@chatbotx.io/business/mini-app"
import { verifyMiniAppToken } from "@chatbotx.io/encryption/mini-app-token"
import { MINI_APP_MAX_UPLOAD_BYTES } from "@chatbotx.io/mini-app"
import { type NextRequest, NextResponse } from "next/server"
import { isCrossSiteRequest } from "@/lib/http/same-site-request"
import { logger } from "@/lib/log"
import {
  checkGuestRateLimit,
  resolveGuestRateLimitKey,
} from "@/lib/rate-limit/guest-rate-limit"
import { loadServableWorkspace } from "@/lib/workspace/load-servable-workspace"

const ID_PATTERN = /^\d{1,20}$/
// Room for the multipart envelope around the largest allowed file.
const MAX_BODY_BYTES = MINI_APP_MAX_UPLOAD_BYTES + 64 * 1024
const UPLOADS_PER_WINDOW = 20

const reject = (code: string, status: number) =>
  NextResponse.json({ error: code }, { status })

/**
 * Public upload for PhotoPicker / DocumentPicker on a Mini App's web link.
 * Unauthenticated: the file is checked against the input's rules (type from
 * its bytes, size, count) and the contact comes only from the signed
 * `{{mini_app_token}}`. The response's `uploadId` is what the submit carries.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (isCrossSiteRequest(req)) {
      return reject("forbidden", 403)
    }
    const { id } = await params
    if (!ID_PATTERN.test(id)) {
      return reject("not_found", 404)
    }
    // The body is read whole by formData(), so its size must be known and
    // bounded first; browsers always send Content-Length for a FormData upload.
    const declaredLength = Number(req.headers.get("content-length"))
    if (!(Number.isFinite(declaredLength) && declaredLength > 0)) {
      return reject("invalid_request", 411)
    }
    if (declaredLength > MAX_BODY_BYTES) {
      return reject("too_large", 413)
    }

    const rateLimit = await checkGuestRateLimit({
      webchatId: `mini-app-upload:${id}`,
      clientIp: resolveGuestRateLimitKey(req.headers, `mini-app-upload:${id}`),
      ipLimit: UPLOADS_PER_WINDOW,
    })
    if (rateLimit.limited) {
      return reject("rate_limited", 429)
    }

    const miniApp = await miniAppService.findUnscoped(id)
    if (!miniApp?.enabled) {
      return reject("not_found", 404)
    }
    const { servable } = await loadServableWorkspace(miniApp.workspaceId)
    if (!servable) {
      return reject("not_found", 404)
    }

    const formData = await req.formData().catch(() => null)
    const file = formData?.get("file")
    const inputName = formData?.get("inputName")
    const token = formData?.get("token")
    if (!(file instanceof File) || typeof inputName !== "string") {
      return reject("invalid_request", 400)
    }
    if (file.size > MINI_APP_MAX_UPLOAD_BYTES) {
      return reject("too_large", 413)
    }

    const payload =
      typeof token === "string" && token
        ? await verifyMiniAppToken(token).catch(() => null)
        : null
    // A token for another workspace is ignored rather than trusted.
    const contactId =
      payload && payload.workspaceId === miniApp.workspaceId
        ? payload.contactId
        : null

    const result = await miniAppUploadService.create({
      miniApp,
      contactId,
      inputName,
      file: {
        name: file.name,
        type: file.type,
        size: file.size,
        bytes: new Uint8Array(await file.arrayBuffer()),
      },
    })
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    if (err instanceof MiniAppUploadError) {
      return reject(err.reason, err.httpStatusCode)
    }
    logger.error({ err }, "Mini App upload failed")
    return reject("upload_failed", 500)
  }
}
