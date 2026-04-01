"use client"

import type { TemplateComponent } from "@chatbotx.io/flow-config"
import Image from "next/image"

type TemplatePreviewProps = {
  components: TemplateComponent[]
  headerParams: Array<{ text?: string; image?: { link: string } }>
  bodyParams: Array<{ text?: string }>
  buttonParams: Array<{ text?: string }>
}

export function TemplatePreview({
  components,
  headerParams,
  bodyParams,
  buttonParams,
}: TemplatePreviewProps) {
  if (!components || components.length === 0) {
    return null
  }

  return (
    <div className="space-y-2 rounded-lg bg-gray-100 p-3">
      {components.map((component) => {
        if (component.type === "HEADER") {
          if (component.format === "TEXT" && component.text) {
            let text = component.text
            if (headerParams && headerParams.length > 0) {
              for (const [i, param] of headerParams.entries()) {
                if (param?.text) {
                  text = text.replace(`{{${i + 1}}}`, param.text)
                  text = text.replace(/\{\{[a-zA-Z_]+\}\}/g, param.text)
                }
              }
            }
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
          let text = component.text
          if (bodyParams && bodyParams.length > 0) {
            for (const [i, param] of bodyParams.entries()) {
              if (param?.text) {
                text = text.replace(`{{${i + 1}}}`, param.text)
                text = text.replace(/\{\{[a-zA-Z_]+\}\}/g, param.text)
              }
            }
          }
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
                let url = button.url || ""
                if (
                  button.type === "URL" &&
                  url.includes("{{1}}") &&
                  buttonParams?.[btnIdx]?.text
                ) {
                  url = url.replace("{{1}}", buttonParams[btnIdx].text)
                }
                return (
                  <div
                    className="rounded border bg-gray-300 px-2 py-1 text-center text-blue-600 text-xs"
                    // biome-ignore lint/suspicious/noArrayIndexKey: safe index
                    key={`button-${component.type}-${btnIdx}-${button.text}`}
                  >
                    {button.text} {url && `→ ${url}`}
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
