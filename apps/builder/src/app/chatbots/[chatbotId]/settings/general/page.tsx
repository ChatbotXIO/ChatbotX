import React from 'react'
// import General from '@/features/settings/setting-general'
import UpdateChatbotForm from '@/features/chatbot/update/update-chatbot-form'

const GeneralPage = ({params} : {  params: { chatbotId: string }}) => {

  return (
    <div>
      <UpdateChatbotForm chatbotId={params.chatbotId}/>
    </div>
  )
}

export default GeneralPage
