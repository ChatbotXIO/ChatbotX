"use client"

export default function DemoWebchatEmbedPage() {
  return (
    <div>
      <h1>Demo Webchat Embed</h1>
      {/* <Script
        onLoad={() => {
          window.ahachatWidget.init({
            chatbotId: "hhtcd8n86igecbwt60p4zvmh",
            webchatId: "k79wuibbzvgkfyu34ilwno42",
            hideHeader: true,
            showLogo: false,
            hideMessageInput: true,
          })
        }}
        src="http://builder.ahachat.example.com:3123/api/webchat/plugin.js"
      /> */}
      <iframe
        height="100%"
        src="http://builder.ahachat.example.com:3123/webchat?chatbotId=hhtcd8n86igecbwt60p4zvmh&webchatId=k79wuibbzvgkfyu34ilwno42"
        title="Webchat"
        width="100%"
      />
    </div>
  )
}
