import ImageDropzone from '@/components/image-dropzone'
import {useEffect, useState} from 'react'
import { useNodeEditorStore } from "@/features/flows/react-flow/stores/node-editor-store";

interface StepImageProps {
  blockIndex: number
  itemIndex: number
}

export default function StepImage({ blockIndex, itemIndex }: StepImageProps) {
  const [imageLink, onImageLink] = useState<boolean>(false)
  const [oldImage, setOldImage] = useState<Record<string, unknown>>({})
  const { updateCurrentNode, currentNode } = useNodeEditorStore()

  const onChangeImage = (file: { file: File, base64: string }) => {
    const newNode = { ...currentNode }
    if (file) {
      newNode.data.blocks[blockIndex].images[itemIndex] = {
        ...newNode.data.blocks[blockIndex].images[itemIndex],
        ...file
      }
    } else {
      newNode.data.blocks[blockIndex].images[itemIndex] = {
        id: newNode.data.blocks[blockIndex].images[itemIndex].id
      }
    }
    updateCurrentNode(newNode)
  }

  useEffect(() => {
    setOldImage(currentNode.data.blocks[blockIndex].images[itemIndex])
  }, [])

  return (
    imageLink ?
      ("hehehe") :
      <ImageDropzone
        oldImage={oldImage}
        onSwitchToImageLink={() => onImageLink(true)}
        onChange={onChangeImage}
      />
  )
}
