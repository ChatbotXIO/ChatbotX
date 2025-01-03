import { ImageIcon, XIcon } from "lucide-react"
import Image from "next/image"
import { useState } from "react"
import { Button } from "./ui/button"
import Dropzone from "react-dropzone"
import { T } from "@tolgee/react"

function AttachedImage({ image, onRemove }: { image: string, onRemove: () => void }) {
  const onClick = (e: any) => {
    e.stopPropagation()
    onRemove()
  }

  return (
    <div className="relative w-full h-full">
      <Image src={image} alt="Uploaded Image" fill={true} className="object-contain" />
      <Button onClick={onClick} variant="ghost" className="absolute top-0 right-0 hover:bg-transparent">
        <XIcon />
      </Button>
    </div>
  )
}

function NeedAttachedImage({ onSwitchToImageLink }: { onSwitchToImageLink: () => void }) {
  const switchToImageLinkMode = (e: any) => {
    e.stopPropagation()
    onSwitchToImageLink()
  }

  return (
    <>
      <div className="p-4 pt-0"><ImageIcon /></div>
      <div>
        <T keyName="common.uploadImageOr" />
        {"\u00A0"}
        <Button variant="link" onClick={switchToImageLinkMode} className="p-0 text-destructive">
          <T keyName="common.insertLink" />
        </Button>
      </div>
    </>
  )
}

export default function ImageDropzone({ onSwitchToImageLink, onChange }: { onSwitchToImageLink: () => void, onChange: (file?: any) => void }) {
  const [image, setImage] = useState<string | null>(null)

  const handleFileChange = (file: File | null) => {
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setImage(reader.result as string)
        onChange({...file, base64: reader.result})
      }
      reader.readAsDataURL(file)
    }
  }

  const handleRemove = () => {
    setImage(null)
    onChange(null)
  }

  return (
    <Dropzone
      maxFiles={1}
      accept={{ "image/*": [] }}
      onDrop={acceptedFiles => handleFileChange(acceptedFiles[0] ?? null)}
    >
      {({ getRootProps, getInputProps }) => (
        <section>
          <div {...getRootProps()}>
            <input {...getInputProps()} />
            <div className="flex flex-col items-center rounded-lg border border-dashed h-36 overflow-hidden justify-center">
              {
                image
                  ? <AttachedImage image={image} onRemove={handleRemove} />
                  : <NeedAttachedImage onSwitchToImageLink={onSwitchToImageLink} />
              }
            </div>
          </div>
        </section>
      )}
    </Dropzone>
  )
}
