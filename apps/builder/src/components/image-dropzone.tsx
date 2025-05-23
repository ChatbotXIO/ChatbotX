import { T } from "@tolgee/react"
import { ImageIcon, XIcon } from "lucide-react"
import Image from "next/image"
import { useEffect, useState, type MouseEvent } from "react"
import Dropzone from "react-dropzone"
import { Button } from "./ui/button"

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
    <div className="relative w-full h-full">
      <Image
        src={image}
        alt="Uploaded Image"
        fill={true}
        className="object-contain"
      />
      <Button
        onClick={onClick}
        variant="ghost"
        className="absolute top-0 right-0 hover:bg-transparent"
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
        <T keyName="common.uploadImageOr" />
        {"\u00A0"}
        <Button
          variant="link"
          onClick={switchToImageLinkMode}
          className="p-0 text-destructive"
        >
          <T keyName="common.insertLink" />
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
      maxFiles={1}
      accept={{ "image/*": [] }}
      onDrop={(acceptedFiles) => handleFileChange(acceptedFiles[0] ?? null)}
    >
      {({ getRootProps, getInputProps }) => (
        <section>
          <div {...getRootProps()}>
            <input {...getInputProps()} />
            <div className="flex flex-col items-center rounded-lg border-dashed border-2 h-36 overflow-hidden justify-center hover:cursor-pointer hover:border-solid hover:border-blue-500">
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
