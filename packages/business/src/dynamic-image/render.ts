import type {
  DynamicImageDocument,
  DynamicImageElement,
  DynamicImageFontFamily,
} from "@chatbotx.io/database/partials"
import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas"
import {
  ensureDynamicImageFontsRegistered,
  resolveDynamicImageFontFamily,
} from "./fonts"
import { renderQrCodeBuffer } from "./qr"

const VARIABLE_RE = /\{\{[^}]+\}\}/

/**
 * The editor preview is a DOM canvas the browser renders at the screen's
 * actual device pixel ratio (2x+ on most modern displays), so text edges,
 * circular clips, and scaled images all come out anti-aliased against many
 * more physical pixels than the document's nominal width/height. Rendering
 * the server canvas 1:1 at that nominal size loses all of that headroom and
 * comes out visibly jagged by comparison. Supersampling — draw everything at
 * `RENDER_SCALE`x the nominal size using the same element coordinates, then
 * ship the higher-resolution PNG as-is — reproduces the same effect without
 * touching any of the per-element draw math below.
 */
const RENDER_SCALE = 2

function createRenderCanvas(width: number, height: number) {
  const canvas = createCanvas(width * RENDER_SCALE, height * RENDER_SCALE)
  const ctx = canvas.getContext("2d")
  ctx.scale(RENDER_SCALE, RENDER_SCALE)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  return { canvas, ctx }
}

export function elementHasVariable(text: string): boolean {
  return VARIABLE_RE.test(text)
}

/**
 * `@napi-rs/canvas`'s built-in `loadImage(url)` only follows 301/302
 * redirects, so it rejects outright on the 307/308 a storage provider (S3,
 * RustFS, CDNs) commonly issues for object URLs. `fetch` follows every
 * redirect status, so route remote URLs through it first and hand
 * `loadImage` the resulting buffer instead of the URL.
 */
export async function loadRemoteImage(
  url: string,
): ReturnType<typeof loadImage> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `Failed to fetch image from ${url}: ${response.status} ${response.statusText}`,
    )
  }
  return loadImage(Buffer.from(await response.arrayBuffer()))
}

/** Static elements are baked once into the background image at save time. */
export function isStaticElement(element: DynamicImageElement): boolean {
  if (element.type === "image") {
    return element.imageType === "url" && !element.priority
  }
  // `text` and `qrCode` both key off their `text` content: no `{{variable}}`
  // means the same PNG works for every contact, so it's safe to bake in.
  return !elementHasVariable(element.text)
}

/**
 * Ids of the elements that must be composited per-contact in
 * `renderDynamicLayer`. Call this on the ORIGINAL, unresolved document —
 * see the note on `renderDynamicLayer` for why passing the already-resolved
 * document here would silently drop every text element that had a variable.
 *
 * `renderStaticLayer` flattens every static element into one bottom-most
 * background image, and `renderDynamicLayer` always paints the dynamic
 * elements on top of that flat background. A static element positioned
 * AFTER a dynamic one in the document can't be represented that way — it
 * would render behind the dynamic element instead of above it. So every
 * element from the first dynamic one onward is treated as dynamic here,
 * even ones that are individually static — only the leading run of static
 * elements (which is guaranteed to stay at the bottom of the stack either
 * way) gets baked into the cached background.
 */
export function getDynamicElementIds(
  document: DynamicImageDocument,
): Set<string> {
  const firstDynamicIndex = document.elements.findIndex(
    (element) => !isStaticElement(element),
  )
  if (firstDynamicIndex === -1) {
    return new Set()
  }
  return new Set(
    document.elements.slice(firstDynamicIndex).map((element) => element.id),
  )
}

function buildFont(element: {
  fontSize: number
  fontFamily: DynamicImageFontFamily
  bold: boolean
  italic: boolean
}): string {
  const parts: string[] = []
  if (element.italic) {
    parts.push("italic")
  }
  if (element.bold) {
    parts.push("bold")
  }
  parts.push(`${element.fontSize}px`)
  parts.push(`"${resolveDynamicImageFontFamily(element.fontFamily)}"`)
  return parts.join(" ")
}

/**
 * Scales `srcWidth x srcHeight` down or up to FIT entirely inside a
 * `boxWidth x boxHeight` box, centered, without cropping any of it — the
 * same result as CSS `object-fit: contain`. Whenever the box's aspect ratio
 * doesn't match the source's, one axis ends up smaller than the box (e.g. a
 * wide photo in a tall box leaves empty space above/below); the alternative
 * (`cover`) would crop the source instead, which loses content whenever the
 * user's chosen box is smaller than the actual image — the exact case this
 * must never do.
 */
function getContainRect(
  srcWidth: number,
  srcHeight: number,
  boxX: number,
  boxY: number,
  boxWidth: number,
  boxHeight: number,
): { dx: number; dy: number; dWidth: number; dHeight: number } {
  const srcRatio = srcWidth / srcHeight
  const boxRatio = boxWidth / boxHeight

  const dWidth = srcRatio > boxRatio ? boxWidth : boxHeight * srcRatio
  const dHeight = srcRatio > boxRatio ? boxWidth / srcRatio : boxHeight

  return {
    dx: boxX + (boxWidth - dWidth) / 2,
    dy: boxY + (boxHeight - dHeight) / 2,
    dWidth,
    dHeight,
  }
}

async function drawImageElement(
  ctx: SKRSContext2D,
  element: Extract<DynamicImageElement, { type: "image" }>,
): Promise<void> {
  if (!element.url) {
    return
  }
  const image = await loadRemoteImage(element.url)
  ctx.save()
  if (element.imageStyle === "circle") {
    const radius = Math.min(element.width, element.height) / 2
    ctx.beginPath()
    ctx.arc(
      element.x + element.width / 2,
      element.y + element.height / 2,
      radius,
      0,
      Math.PI * 2,
    )
    ctx.clip()
  }
  const { dx, dy, dWidth, dHeight } = getContainRect(
    image.width,
    image.height,
    element.x,
    element.y,
    element.width,
    element.height,
  )
  ctx.drawImage(image, dx, dy, dWidth, dHeight)
  ctx.restore()
}

async function drawQrCodeElement(
  ctx: SKRSContext2D,
  element: Extract<DynamicImageElement, { type: "qrCode" }>,
): Promise<void> {
  const buffer = await renderQrCodeBuffer({
    text: element.text,
    size: element.size,
    color: element.color,
    logoUrl: element.logoUrl,
  })
  const image = await loadImage(buffer)
  ctx.drawImage(image, element.x, element.y, element.width, element.width)
}

function textAnchorX(
  element: Extract<DynamicImageElement, { type: "text" }>,
): number {
  if (element.align === "center") {
    return element.x + element.width / 2
  }
  if (element.align === "right") {
    return element.x + element.width
  }
  return element.x
}

/**
 * Greedy word-wrap: appends words to the current line while it still fits
 * `maxWidth`, starting a new line otherwise — matching the browser's own
 * wrapping behavior that the editor preview relies on (CSS `wrap-break-word`).
 */
function wrapText(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(" ")
  const lines: string[] = []
  let currentLine = ""

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word
    if (currentLine && ctx.measureText(candidate).width > maxWidth) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = candidate
    }
  }
  if (currentLine) {
    lines.push(currentLine)
  }
  return lines
}

function drawTextElement(
  ctx: SKRSContext2D,
  element: Extract<DynamicImageElement, { type: "text" }>,
): void {
  ctx.save()
  ctx.beginPath()
  ctx.rect(element.x, element.y, element.width, element.height)
  ctx.clip()

  ctx.font = buildFont(element)
  ctx.fillStyle = element.color
  ctx.textAlign = element.align
  ctx.textBaseline = "top"
  const text = element.uppercase ? element.text.toUpperCase() : element.text
  const x = textAnchorX(element)
  const lineHeight = element.fontSize * 1.2

  const lines = wrapText(ctx, text, element.width)
  for (const [index, line] of lines.entries()) {
    ctx.fillText(line, x, element.y + index * lineHeight)
  }
  ctx.restore()
}

async function drawElement(
  ctx: SKRSContext2D,
  element: DynamicImageElement,
): Promise<void> {
  if (element.type === "image") {
    await drawImageElement(ctx, element)
  } else if (element.type === "qrCode") {
    await drawQrCodeElement(ctx, element)
  } else {
    drawTextElement(ctx, element)
  }
}

/**
 * Composites only the leading run of static elements — used to bake the
 * cached background. Must skip the same elements `getDynamicElementIds`
 * promotes to dynamic (any static element after the first dynamic one), or
 * they'd be drawn twice: once here at the bottom, once again on top in
 * `renderDynamicLayer`.
 */
export async function renderStaticLayer(
  document: DynamicImageDocument,
): Promise<Buffer> {
  ensureDynamicImageFontsRegistered()
  const { canvas, ctx } = createRenderCanvas(document.width, document.height)
  const dynamicElementIds = getDynamicElementIds(document)
  for (const element of document.elements) {
    if (!dynamicElementIds.has(element.id)) {
      await drawElement(ctx, element)
    }
  }
  return canvas.toBuffer("image/png")
}

/**
 * Draws the cached background as the base layer, then composites the dynamic
 * elements (already variable-resolved by the caller) on top.
 *
 * `dynamicElementIds` must be computed from the ORIGINAL, unresolved document
 * (`isStaticElement` on each raw element) — never re-derived from `document`
 * here. `document` already has every `{{variable}}` substituted with a real
 * value by the caller, so `elementHasVariable`/`isStaticElement` can no
 * longer see the `{{...}}` markers on a text element that legitimately had
 * one: it would misclassify that element as static and skip drawing it,
 * even though it was never baked into the background either (it was
 * excluded from `renderStaticLayer` for the exact opposite reason).
 */
export async function renderDynamicLayer(input: {
  document: DynamicImageDocument
  backgroundBuffer: Buffer
  dynamicElementIds: ReadonlySet<string>
}): Promise<Buffer> {
  ensureDynamicImageFontsRegistered()
  const { document, backgroundBuffer, dynamicElementIds } = input
  const { canvas, ctx } = createRenderCanvas(document.width, document.height)
  const background = await loadImage(backgroundBuffer)
  ctx.drawImage(background, 0, 0, document.width, document.height)

  for (const element of document.elements) {
    if (dynamicElementIds.has(element.id)) {
      await drawElement(ctx, element)
    }
  }
  return canvas.toBuffer("image/png")
}
