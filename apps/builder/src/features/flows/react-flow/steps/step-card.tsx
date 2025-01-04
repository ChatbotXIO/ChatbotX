import {SyntheticEvent, useEffect, useState} from 'react'
import ImageDropzone from '@/components/image-dropzone'

import { Card, CardFooter, CardHeader, CardContent } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PlusIcon } from "lucide-react";
import { useNodeEditorStore } from "@/features/flows/react-flow/stores/node-editor-store";
import { createId } from "@paralleldrive/cuid2";

interface StepCardProps {
  blockIndex: number
  itemIndex: number
}

export default function AddCard({ blockIndex, itemIndex }: StepCardProps) {
  const { currentNode, updateCurrentNode } = useNodeEditorStore()
  const [imageLink, onImageLink] = useState<boolean>(false)
  const [card, setCard] = useState<Record<string, unknown>>({})

  const onChangeImage = (image: Record<string, unknown>) => {
    _updateData({
      image: {
        id: createId(),
        ...image
      }
    })
  }

  const onChangeTitle = ({ target: { value = '' }}: SyntheticEvent) => {
    _updateData({ title: value })
  }

  const onChangeSubtitle = ({ target: { value = '' }}: SyntheticEvent) => {
    _updateData({ subtitle: value })
  }

  const _updateData = (payload: Record<string, unknown>) => {
    const newNode = { ...currentNode }

    newNode.data.blocks[blockIndex].cards[itemIndex] = {
      ...newNode.data.blocks[blockIndex].cards[itemIndex],
      ...payload
    }

    updateCurrentNode(newNode)
  }

  useEffect(() => {
    setCard(currentNode.data.blocks[blockIndex].cards[itemIndex])
  }, [])

  return (
    <Card className="w-full shadow-lg rounded-lg border-2 hover:border-blue-500 hover:border-solid hover:cursor-pointer">
      <CardHeader className="p-2">
        <ImageDropzone
          oldImage={card.image}
          onSwitchToImageLink={() => onImageLink(true)}
          onChange={onChangeImage}
        />
      </CardHeader>
      <CardContent className="p-2 bg-gray-200">
        <Input
          placeholder="Title (Required)" className="mb-2 border-0 focus-visible:ring-0 focus-visible:border-none"
          maxLength={255}
          value={card.title}
          onChange={onChangeTitle}
          required
        />
        <Input
          placeholder="Subtitle"
          className="border-0 focus-visible:ring-0 focus-visible:border-none"
          maxLength={255}
          value={card.subtitle}
          onChange={onChangeSubtitle}
        />
      </CardContent>
      <CardFooter className="p-2 bg-gray-200">
        <Button className="w-full rounded-full" variant="secondary">
          <PlusIcon />
          Add Button
        </Button>
      </CardFooter>
    </Card>
  )
}
