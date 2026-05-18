"use client"

import {
  type PageElementSchema,
  type PageElementType,
  pageElementTypes,
} from "@chatbotx.io/flow-config"
import { Separator } from "@chatbotx.io/ui/components/ui/separator"
import Image from "next/image"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { DirectUploadOrInsertLink } from "@/components/direct-upload"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"
import { ButtonStepEditor } from "../../steps/button/editor"
import { ButtonStepViewer } from "../../steps/button/viewer"

type BuilderProps = {
  parentName: string
  type: PageElementType
}
export function PageElementBuilder({ type, parentName }: BuilderProps) {
  const params = useParams<{ workspaceId: string; flowId: string }>()

  const t = useTranslations()
  switch (type) {
    case pageElementTypes.enum.heading:
      return (
        <TiptapEditorField
          name={`${parentName}.text`}
          placeholder={t("fields.heading.placeholder")}
        />
      )
    case pageElementTypes.enum.text:
      return (
        <TiptapEditorField
          name={`${parentName}.text`}
          placeholder={t("fields.text.placeholder")}
        />
      )
    case pageElementTypes.enum.image:
      return (
        <DirectUploadOrInsertLink
          fileType="image"
          parentName={parentName}
          uploadPath={`public/space/${params.workspaceId}/flows/${params.flowId}/elements/${parentName}`}
        />
      )
    case pageElementTypes.enum.button:
      return <ButtonStepEditor parentName={`${parentName}`} />
    case pageElementTypes.enum.line:
      return <Separator />
    case pageElementTypes.enum.spacing:
      return <div className="h-4" />
    case pageElementTypes.enum.code:
      return (
        <TiptapEditorField
          name={`${parentName}.text`}
          placeholder={t("fields.code.placeholder")}
        />
      )
    default:
      return null
  }
}

type ViewerProps = {
  data: PageElementSchema
}
export function PageElementViewer({ data }: ViewerProps) {
  switch (data.type) {
    case pageElementTypes.enum.heading:
      return <p className="font-semibold">{data.text}</p>
    case pageElementTypes.enum.text:
      return <p>{data.text}</p>
    case pageElementTypes.enum.image:
      return (
        <div className="relative h-37.5">
          {data.url?.startsWith("https") ? (
            <Image alt={data.type} fill={true} src={data.url} />
          ) : null}
        </div>
      )
    case pageElementTypes.enum.button:
      return data.beforeStep ? <ButtonStepViewer data={data} /> : null
    case pageElementTypes.enum.line:
      return <Separator />
    case pageElementTypes.enum.spacing:
      return <div className="h-4" />
    case pageElementTypes.enum.code:
      return <p className="font-mono text-sm">{data.text}</p>
    default:
      return null
  }
}
