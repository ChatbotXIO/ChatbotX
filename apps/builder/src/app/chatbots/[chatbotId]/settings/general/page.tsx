import React from 'react'
import { UpdateChatbotForm } from '@/features/chatbot/update/update-chatbot-form'

export default async function GeneralPage(
  props: { params: Promise<{ chatbotId: string }> }
) {

  const params = await props.params

  return (
    <div>
      <UpdateChatbotForm id={params.chatbotId} />
    </div>
  );
}
