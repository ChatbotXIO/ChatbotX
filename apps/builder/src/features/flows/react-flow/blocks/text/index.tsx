'use client'

import type { NodeBlockText } from "@/features/flows/react-flow/blocks/text/types";
import { Input } from '@/components/ui/input'

interface NodeBlockTextProps {
  text: NodeBlockText
}

export default function NodeBlockText({text}: NodeBlockTextProps) {
  return (
    <div className="mb-3">
      <Input className="rounded-full bg-gray-500 placeholder:text-gray-100" disabled placeholder="Type a message..." value={text.text} />
    </div>
  )
}
