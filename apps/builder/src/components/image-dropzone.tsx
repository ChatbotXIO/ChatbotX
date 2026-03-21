import { Button } from "@chatbotx.io/ui/components/ui/button"
import { ImageIcon, XIcon } from "lucide-react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { type MouseEvent, useEffect, useState } from "react"
import Dropzone from "react-dropzone"

function AttachedImage({
  image,
  onRemove,
}: {
  image: string
  onRemove: () => void
}) {
  const onClick = (e: MouseEvent) => {
    e.stopPropagation()
    onRemove()
  }

  return (
    <div className="relative h-full w-full">
      <Image
        alt="Uploaded Image"
        className="object-contain"
        fill={true}
        src={image}
      />
      <Button
        className="absolute top-0 right-0 hover:bg-transparent"
        onClick={onClick}
        variant="ghost"
      >
        <XIcon />
      </Button>
    </div>
  )
}

function NeedAttachedImage({
  onSwitchToImageLink,
}: {
  onSwitchToImageLink: () => void
}) {
  const t = useTranslations()

  const switchToImageLinkMode = (e: MouseEvent) => {
    e.stopPropagation()
    onSwitchToImageLink()
  }

  return (
    <>
      <div className="p-4 pt-0">
        <ImageIcon />
      </div>
      <div>
        {t("texts.or")}
        {"\u00A0"}
        <Button
          className="p-0 text-destructive"
          onClick={switchToImageLinkMode}
          variant="link"
        >
          {t("actions.insertLink")}
        </Button>
      </div>
    </>
  )
}

export default function ImageDropzone({
  oldImage,
  onSwitchToImageLink,
  onChange,
}: {
  oldImage: Record<string, unknown>
  onSwitchToImageLink: () => void
  onChange: (file?: Record<string, unknown>) => void
}) {
  const [image, setImage] = useState<string | null>(null)

  const handleFileChange = (file: File | null) => {
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setImage(reader.result as string)
        onChange({ file, base64: reader.result })
      }
      reader.readAsDataURL(file)
    }
  }

  const handleRemove = () => {
    setImage(null)
    onChange({ file: null, base64: null })
  }

  useEffect(() => {
    if (oldImage && Object.keys(oldImage)) {
      setImage(oldImage.base64 as string)
    }
  }, [oldImage])

  return (
    <Dropzone
      accept={{ "image/*": [] }}
      maxFiles={1}
      onDrop={(acceptedFiles) => handleFileChange(acceptedFiles[0] ?? null)}
    >
      {({ getRootProps, getInputProps }) => (
        <section>
          <div {...getRootProps()}>
            <input {...getInputProps()} />
            <div className="flex h-36 flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed hover:cursor-pointer hover:border-blue-500 hover:border-solid">
              {image ? (
                <AttachedImage image={image} onRemove={handleRemove} />
              ) : (
                <NeedAttachedImage onSwitchToImageLink={onSwitchToImageLink} />
              )}
            </div>
          </div>
        </section>
      )}
    </Dropzone>
  )
}
