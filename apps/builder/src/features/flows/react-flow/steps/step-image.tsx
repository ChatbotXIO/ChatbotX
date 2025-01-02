import ImageDropzone from '@/components/image-dropzone'
import { useState } from 'react'
import { useNodeEditorStore } from "@/features/flows/react-flow/stores/node-editor-store";

export default function StepImage() {
  const [imageLink, onImageLink] = useState<boolean>(false)
  const { updateImageNode } = useNodeEditorStore()

  const onChangeImage = (file: any) => {
    updateImageNode(file)
  }

  return (
    imageLink ?
      ("hehehe") :
      <ImageDropzone
        onSwitchToImageLink={() => onImageLink(true)}
        onChange={onChangeImage}
      />
  )
}
