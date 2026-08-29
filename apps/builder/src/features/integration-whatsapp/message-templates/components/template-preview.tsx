"use client"

import {
  type ButtonSubType,
  countMpmProducts,
  isFutureExpirationTimeMs,
  type TemplateComponent,
  type TemplateComponentButton,
  type WaTemplateButtonParam,
  type WaTemplateParams,
} from "@chatbotx.io/flow-config"
import { formatDate } from "@chatbotx.io/ui/lib/format"
import Image from "next/image"
import { useLocale, useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { substituteTemplateText } from "./template-preview-utils"

/**
 * The picker components (`MetaCatalogProductSelect`, `MpmSectionsField`)
 * stash a display-only name alongside the sent `thumbnail_product_retailer_id`
 * so this preview can show it without an extra fetch — the field isn't part
 * of `waTemplateButtonParamSchema`, so it never reaches the send payload.
 */
type PreviewButtonParam = WaTemplateButtonParam & {
  thumbnail_product_retailer_name?: string
}

type TemplatePreviewProps = {
  components: TemplateComponent[]
  headerParams: Array<{ text?: string; image?: { link: string } }>
  bodyParams: Array<{ text?: string }>
  buttonParams: PreviewButtonParam[]
  limitedTimeOfferParam?: WaTemplateParams["limited_time_offer"]
}

// Button param entries are stored densely and carry the template button index
// in their `index` field, so lookups must match on it (with the array position
// as a legacy fallback for entries saved without an index).
function findButtonParam(
  buttonParams: TemplatePreviewProps["buttonParams"],
  templateButtonIndex: number,
): PreviewButtonParam | undefined {
  return (
    buttonParams?.find((param) => param?.index === templateButtonIndex) ??
    buttonParams?.[templateButtonIndex]
  )
}

type ButtonPreviewProps = {
  button: TemplateComponentButton
  buttonParam?: PreviewButtonParam
}

/** Default: static label, plus the resolved URL suffix for a dynamic-URL button. */
function DefaultButtonPreview({ button, buttonParam }: ButtonPreviewProps) {
  let url = button.url || ""
  if (button.type === "URL" && url.includes("{{1}}") && buttonParam?.text) {
    url = url.replace("{{1}}", buttonParam.text)
  }
  return (
    <>
      {button.text} {url && `→ ${url}`}
    </>
  )
}

function CatalogButtonPreview({ button, buttonParam }: ButtonPreviewProps) {
  const t = useTranslations()
  const productName = buttonParam?.thumbnail_product_retailer_name
  return (
    <>
      {button.text} →{" "}
      {productName || t("whatsapp.messageTemplate.params.catalogUseDefault")}
    </>
  )
}

function MpmButtonPreview({ button, buttonParam }: ButtonPreviewProps) {
  const t = useTranslations()
  const sectionCount = buttonParam?.sections?.length ?? 0
  const productCount = countMpmProducts(buttonParam?.sections)
  return (
    <>
      {button.text} →{" "}
      {t("whatsapp.messageTemplate.params.mpmProductsSummary", {
        productCount,
        sectionCount,
      })}
    </>
  )
}

/**
 * One preview renderer per button sub_type, mirroring the `ButtonParamField`
 * registry: only sub_types whose sent payload isn't self-explanatory from the
 * template's static button text need an entry here. Everything else — and any
 * future sub_type this map doesn't recognise — falls back to the default
 * label + resolved-URL rendering.
 */
const buttonPreviewRenderers: Partial<
  Record<ButtonSubType, (props: ButtonPreviewProps) => ReactNode>
> = {
  catalog: CatalogButtonPreview,
  mpm: MpmButtonPreview,
}

function ButtonPreview({ button, buttonParam }: ButtonPreviewProps) {
  const subType = button.type.toLowerCase() as ButtonSubType
  const Renderer = buttonPreviewRenderers[subType] ?? DefaultButtonPreview
  return <Renderer button={button} buttonParam={buttonParam} />
}

function LimitedTimeOfferPreview({
  expirationTimeMs,
}: {
  expirationTimeMs: number
}) {
  const t = useTranslations()
  const locale = useLocale()
  const formatted = formatDate(expirationTimeMs, {
    locale,
    hour: "numeric",
    minute: "2-digit",
  })
  const isFuture = isFutureExpirationTimeMs(expirationTimeMs)

  return (
    <div
      className={
        isFuture
          ? "inline-block w-fit rounded bg-amber-100 px-2 py-1 text-amber-800 text-xs dark:bg-amber-950 dark:text-amber-300"
          : "inline-block w-fit rounded bg-muted px-2 py-1 text-muted-foreground text-xs"
      }
    >
      {t(
        isFuture
          ? "whatsapp.messageTemplate.params.limitedTimeOfferBadge"
          : "whatsapp.messageTemplate.params.limitedTimeOfferExpiredBadge",
        { date: formatted },
      )}
    </div>
  )
}

export function TemplatePreview({
  components,
  headerParams,
  bodyParams,
  buttonParams,
  limitedTimeOfferParam,
}: TemplatePreviewProps) {
  if (!components || components.length === 0) {
    return null
  }

  return (
    <div className="space-y-2 rounded-lg bg-muted p-3">
      {components.map((component) => {
        if (component.type === "HEADER") {
          if (component.format === "TEXT" && component.text) {
            const text = substituteTemplateText(component.text, headerParams)
            return (
              <div
                className="font-bold text-sm"
                key={`header-text-${component.type}`}
              >
                {text}
              </div>
            )
          }
          if (component.format === "IMAGE" && headerParams?.[0]?.image?.link) {
            let imageUrl: URL | null = null
            try {
              imageUrl = new URL(headerParams[0].image.link)
            } catch {
              imageUrl = null
            }

            return (
              <div className="mb-2" key={`header-image-${component.type}`}>
                {imageUrl ? (
                  <div className="relative h-32 w-full">
                    <Image
                      alt="Header preview"
                      className="h-full w-full rounded object-contain object-left"
                      fill={true}
                      src={imageUrl.toString()}
                    />
                  </div>
                ) : (
                  <div className="rounded border bg-muted px-2 py-1 text-muted-foreground text-xs">
                    {headerParams[0].image.link}
                  </div>
                )}
              </div>
            )
          }
        }
        if (component.type === "BODY" && component.text) {
          const text = substituteTemplateText(component.text, bodyParams)
          return (
            <div
              className="whitespace-pre-wrap text-sm"
              key={`body-${component.type}`}
            >
              {text}
            </div>
          )
        }
        if (component.type === "FOOTER" && component.text) {
          return (
            <div
              className="mt-2 text-muted-foreground text-xs"
              key={`footer-${component.type}`}
            >
              {component.text}
            </div>
          )
        }
        if (component.type === "BUTTONS" && component.buttons) {
          return (
            <div className="mt-2 space-y-1" key={`buttons-${component.type}`}>
              {component.buttons.map((button, btnIdx) => {
                const buttonParam = findButtonParam(buttonParams, btnIdx)
                return (
                  <div
                    className="rounded border bg-gray-300 px-2 py-1 text-center text-blue-600 text-xs"
                    // biome-ignore lint/suspicious/noArrayIndexKey: safe index
                    key={`button-${component.type}-${btnIdx}-${button.text}`}
                  >
                    <ButtonPreview button={button} buttonParam={buttonParam} />
                  </div>
                )
              })}
            </div>
          )
        }
        if (
          component.type === "LIMITED_TIME_OFFER" &&
          typeof limitedTimeOfferParam?.expiration_time_ms === "number"
        ) {
          return (
            <LimitedTimeOfferPreview
              expirationTimeMs={limitedTimeOfferParam.expiration_time_ms}
              key={`lto-${component.type}`}
            />
          )
        }
        return null
      })}
    </div>
  )
}
