"use client"

import type { MessengerTemplateComponent } from "@chatbotx.io/flow-config"
import Image from "next/image"

type MessengerTemplatePreviewProps = {
  components: MessengerTemplateComponent[]
  headerParams: Array<{
    type?: string
    text?: string
    image?: { link: string }
  }>
  bodyParams: Array<{ text?: string }>
  buttonParams: Array<{
    sub_type?: string
    index?: number
    text?: string
    payload?: string
  }>
}

const NAMED_PARAMETER_PATTERN = /\{\{[a-zA-Z_]+\}\}/
// A URL button's suffix placeholder: positional ({{1}}) or, in NAMED
// templates, named ({{url_suffix}}).
const URL_SUFFIX_PATTERN = /\{\{(\d+|[a-zA-Z_]+)\}\}/

function renderTemplateText(
  templateText: string,
  params: Array<{ text?: string }>,
) {
  let text = templateText
  const textParams = params.filter((param) => param.text)

  for (const [i, param] of textParams.entries()) {
    if (param.text) {
      text = text.replaceAll(`{{${i + 1}}}`, param.text)
    }
  }

  for (const param of textParams) {
    if (param.text) {
      text = text.replace(NAMED_PARAMETER_PATTERN, param.text)
    }
  }

  return text
}

const HTTP_URL_PATTERN = /^https?:\/\//i

/**
 * A Messenger IMAGE header's picture is fixed at template creation, so it is
 * never a send-time param: the stored template keeps Meta's listed image URL
 * in `example.header_handle[0]` (a raw upload handle is not a URL and is
 * skipped).
 */
function readTemplateHeaderImageUrl(example: unknown): string | undefined {
  if (!(example && typeof example === "object" && "header_handle" in example)) {
    return
  }
  const [firstHandle] = Array.isArray(example.header_handle)
    ? example.header_handle
    : []
  return typeof firstHandle === "string" && HTTP_URL_PATTERN.test(firstHandle)
    ? firstHandle
    : undefined
}

// An explicit image param (the template management view passes one) wins;
// broadcast and flow editors pass send-time params only, so fall back to the
// template's own image.
function resolveHeaderImageLink(
  component: MessengerTemplateComponent,
  headerParams: MessengerTemplatePreviewProps["headerParams"],
): string | undefined {
  return (
    headerParams.find((param) => param.image?.link)?.image?.link ??
    readTemplateHeaderImageUrl(component.example)
  )
}

function getButtonParam(
  buttonParams: MessengerTemplatePreviewProps["buttonParams"],
  buttonType: string,
  buttonIndex: number,
) {
  const subType = buttonType.toLowerCase()
  return (
    buttonParams.find(
      (param) => param.index === buttonIndex && param.sub_type === subType,
    ) ??
    buttonParams.find((param) => param.index === buttonIndex) ??
    buttonParams.find((param) => param.sub_type === subType)
  )
}

export function MessengerTemplatePreview({
  components,
  headerParams,
  bodyParams,
  buttonParams,
}: MessengerTemplatePreviewProps) {
  if (!components || components.length === 0) {
    return null
  }

  return (
    <div className="space-y-2 rounded-lg bg-muted p-3">
      {components.map((component) => {
        const componentType = component.type?.toUpperCase()
        const componentFormat = component.format?.toUpperCase()

        if (componentType === "HEADER") {
          const headerText = component.text
            ? renderTemplateText(component.text, headerParams)
            : null

          const headerImageLink =
            componentFormat === "IMAGE"
              ? resolveHeaderImageLink(component, headerParams)
              : undefined

          if (headerImageLink) {
            let imageUrl: URL | null = null
            try {
              imageUrl = new URL(headerImageLink)
            } catch {
              imageUrl = null
            }

            return (
              <div className="space-y-2" key={`header-image-${component.type}`}>
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
                    {headerImageLink}
                  </div>
                )}
                {headerText && (
                  <div className="font-bold text-sm">{headerText}</div>
                )}
              </div>
            )
          }

          if (headerText) {
            return (
              <div
                className="font-bold text-sm"
                key={`header-text-${component.type}`}
              >
                {headerText}
              </div>
            )
          }
        }
        if (componentType === "BODY" && component.text) {
          const text = renderTemplateText(component.text, bodyParams)
          return (
            <div
              className="whitespace-pre-wrap text-sm"
              key={`body-${component.type}`}
            >
              {text}
            </div>
          )
        }
        if (componentType === "FOOTER" && component.text) {
          return (
            <div
              className="mt-2 text-muted-foreground text-xs"
              key={`footer-${component.type}`}
            >
              {component.text}
            </div>
          )
        }
        if (componentType === "BUTTONS" && component.buttons) {
          return (
            <div className="mt-2 space-y-1" key={`buttons-${component.type}`}>
              {component.buttons.map((button, btnIdx) => {
                const buttonType = button.type?.toUpperCase()
                const buttonParam = getButtonParam(
                  buttonParams,
                  button.type,
                  btnIdx,
                )
                let detail = ""

                if (buttonType === "URL") {
                  detail = button.url ?? ""
                  const value = buttonParam?.text
                  if (value && URL_SUFFIX_PATTERN.test(detail)) {
                    detail = detail.replace(URL_SUFFIX_PATTERN, value)
                  } else if (!detail && value) {
                    detail = value
                  }
                }

                if (
                  buttonType === "PHONE_NUMBER" &&
                  "phone_number" in button &&
                  button.phone_number
                ) {
                  detail = button.phone_number
                }

                return (
                  <div
                    className="rounded border bg-gray-300 px-2 py-1 text-center text-blue-600 text-xs"
                    // biome-ignore lint/suspicious/noArrayIndexKey: safe index
                    key={`button-${component.type}-${btnIdx}-${button.text}`}
                  >
                    {button.text} {detail && `→ ${detail}`}
                  </div>
                )
              })}
            </div>
          )
        }
        return null
      })}
    </div>
  )
}
