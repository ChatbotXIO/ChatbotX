import ImageDropzone from '@/components/image-dropzone'
import { useState } from 'react'

export default function StepImage() {
  const [imageLink, onImageLink] = useState<boolean>(false)

  return (
    imageLink ? ("hehehe") : <ImageDropzone onSwitchToImageLink={() => onImageLink(true)} />
  )
}
