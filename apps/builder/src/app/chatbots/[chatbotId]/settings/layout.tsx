import ChatbotTabs from "@/features/chatbot/components/chatbot-tabs";

export default async function SettingLayout(
  props: { children: React.ReactNode, params: Promise<{ chatbotId: string }>, searchParams: Promise<any> }
) {


  const params = await props.params

  const tabs = [
    { value: "general", label: "General", path: `/chatbots/${params.chatbotId}/settings/general` },
    { value: "channels", label: "Channels", path: `/chatbots/${params.chatbotId}/settings/channels` },
  ];

  return (
    <div className="px-16 bg-gray-50">
      <ChatbotTabs tabs={tabs} />
      <div>{props.children}</div>
    </div>
  );
}
