import {
  MiniAppUploadError,
  miniAppUploadService,
} from "@chatbotx.io/business/mini-app"
import { MINI_APP_MAX_UPLOAD_BYTES } from "@chatbotx.io/mini-app"
import { type NextRequest, NextResponse } from "next/server"
import { loadServableMiniApp } from "@/features/mini-apps/lib/public-mini-app"
import { resolveVisitorContactId } from "@/features/mini-apps/lib/resolve-visitor-contact"
import { isCrossSiteRequest } from "@/lib/http/same-site-request"
import { logger } from "@/lib/log"
import {
  checkGuestRateLimit,
  resolveGuestRateLimitKey,
} from "@/lib/rate-limit/guest-rate-limit"

const ID_PATTERN = /^\d{1,20}$/
// Room for the multipart envelope around the largest allowed file.
const MAX_BODY_BYTES = MINI_APP_MAX_UPLOAD_BYTES + 64 * 1024
const UPLOADS_PER_WINDOW = 20

const reject = (code: string, status: number) =>
  NextResponse.json({ error: code }, { status })

/**
 * Refuses a request before its body is read: cross-site, an id that is not
 * one, or a body whose size is unknown or too large. formData() reads the
 * body whole, so its size must be bounded first; browsers always send
 * Content-Length for a FormData upload.
 */
function checkRequestEnvelope(req: NextRequest, id: string) {
  if (isCrossSiteRequest(req)) {
    return reject("forbidden", 403)
  }
  if (!ID_PATTERN.test(id)) {
    return reject("not_found", 404)
  }
  const declaredLength = Number(req.headers.get("content-length"))
  if (!(Number.isFinite(declaredLength) && declaredLength > 0)) {
    return reject("invalid_request", 411)
  }
  if (declaredLength > MAX_BODY_BYTES) {
    return reject("too_large", 413)
  }
  return null
}

/** The file, its input and the visitor's token from the multipart body. */
async function parseUploadForm(req: NextRequest) {
  const formData = await req.formData().catch(() => null)
  const file = formData?.get("file")
  const inputName = formData?.get("inputName")
  const token = formData?.get("token")
  if (!(file instanceof File) || typeof inputName !== "string") {
    return null
  }
  return {
    file,
    inputName,
    token: typeof token === "string" ? token : undefined,
  }
}

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
    const { id } = await params
    const refused = checkRequestEnvelope(req, id)
    if (refused) {
      return refused
    }

    const rateLimit = await checkGuestRateLimit({
      webchatId: `mini-app-upload:${id}`,
      clientIp: resolveGuestRateLimitKey(req.headers, `mini-app-upload:${id}`),
      ipLimit: UPLOADS_PER_WINDOW,
    })
    if (rateLimit.limited) {
      return reject("rate_limited", 429)
    }

    const miniApp = await loadServableMiniApp(id)
    if (!miniApp) {
      return reject("not_found", 404)
    }

    const form = await parseUploadForm(req)
    if (!form) {
      return reject("invalid_request", 400)
    }
    if (form.file.size > MINI_APP_MAX_UPLOAD_BYTES) {
      return reject("too_large", 413)
    }

    const result = await miniAppUploadService.create({
      miniApp,
      contactId: await resolveVisitorContactId({
        token: form.token,
        workspaceId: miniApp.workspaceId,
        miniAppId: miniApp.id,
      }),
      inputName: form.inputName,
      file: {
        name: form.file.name,
        type: form.file.type,
        size: form.file.size,
        bytes: new Uint8Array(await form.file.arrayBuffer()),
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
