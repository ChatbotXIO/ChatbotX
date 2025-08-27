# AhaBaha Webchat Widget

The AhaBaha Webchat Widget is a powerful, customizable chat interface that can be embedded on any website to provide instant customer support and engagement.

## Features

- **Real-time Chat**: Instant messaging with AI-powered responses
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Customizable Appearance**: Match your brand colors and styling
- **File Attachments**: Support for document and media sharing
- **Voice Messages**: Audio input capability for hands-free communication
- **Working Hours**: Configure availability based on your business hours
- **Visitor Tracking**: Unique visitor identification and conversation history
- **Multi-theme Support**: Light, dark, and auto themes
- **Easy Integration**: Simple JavaScript snippet for any website

## Quick Start

### 1. Get Your Chatbot ID

First, create a chatbot in your AhaBaha dashboard and note the chatbot ID.

### 2. Add the Embed Code

Copy and paste this code into your website's HTML, preferably just before the closing `</body>` tag:

```html
<!-- AhaBaha Webchat Widget -->
<script>
(function() {
  const script = document.createElement('script');
  script.src = 'https://your-domain.com/webchat.js';
  script.async = true;
  script.onload = function() {
    window.AhaBaha.init({
      chatbotId: 'your-chatbot-id',
      position: 'bottom-right',
      theme: 'light',
      chatbotName: 'Your Chatbot Name'
    });
  };
  document.head.appendChild(script);
})();
</script>
```

### 3. Customize the Widget

You can customize various aspects of the widget:

```javascript
window.AhaBaha.init({
  chatbotId: 'your-chatbot-id',
  position: 'bottom-right', // 'bottom-right' or 'bottom-left'
  theme: 'light', // 'light', 'dark', or 'auto'
  chatbotName: 'Your Brand Name',
  primaryColor: '#2563eb',
  widgetTitle: 'Chat with us',
  welcomeMessage: 'Hello! How can I help you today?',
  showBranding: true,
  autoOpen: false,
  requireEmail: false,
  collectUserInfo: true
});
```

## Configuration Options

### Basic Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `chatbotId` | string | required | Your chatbot's unique identifier |
| `position` | string | 'bottom-right' | Widget position on the page |
| `theme` | string | 'light' | Visual theme (light/dark/auto) |
| `chatbotName` | string | 'AhaBaha' | Name displayed in the widget |

### Appearance

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `primaryColor` | string | '#2563eb' | Primary brand color |
| `widgetTitle` | string | 'Chat with us' | Header text |
| `welcomeMessage` | string | 'Hello! How can I help you today?' | Initial bot message |
| `showBranding` | boolean | true | Show "Powered by AhaBaha" |

### Behavior

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `autoOpen` | boolean | false | Automatically open on page load |
| `requireEmail` | boolean | false | Require email before chatting |
| `collectUserInfo` | boolean | true | Gather visitor information |

## API Endpoints

### Send Message

```
POST /api/webchat/{chatbotId}/chat
```

**Request Body:**
```json
{
  "message": "Hello, I need help",
  "visitorId": "visitor_123",
  "email": "user@example.com",
  "name": "John Doe",
  "metadata": {
    "url": "https://example.com/page",
    "userAgent": "Mozilla/5.0...",
    "timestamp": "2024-01-01T00:00:00Z"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "msg_123",
    "content": "Thanks for your message! How can I help you?",
    "timestamp": "2024-01-01T00:00:01Z",
    "visitorId": "visitor_123"
  }
}
```

### Get Conversation History

```
GET /api/webchat/{chatbotId}/chat?visitorId={visitorId}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "visitorId": "visitor_123",
    "chatbotId": "chatbot_456",
    "conversationHistory": [
      {
        "id": "msg_1",
        "content": "Hello! How can I help you today?",
        "sender": "bot",
        "timestamp": "2024-01-01T00:00:00Z"
      }
    ]
  }
}
```

## Styling and Customization

### CSS Classes

The widget uses the following CSS classes for styling:

- `.ahabaha-widget` - Main widget container
- `.ahabaha-widget-header` - Header section
- `.ahabaha-widget-body` - Chat body
- `.ahabaha-messages` - Messages container
- `.ahabaha-message` - Individual message
- `.ahabaha-bot` - Bot message styling
- `.ahabaha-user` - User message styling
- `.ahabaha-input-area` - Input section
- `.ahabaha-toggle` - Chat toggle button

### Custom CSS

You can override the default styles by adding custom CSS:

```css
.ahabaha-widget {
  border-radius: 20px !important;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2) !important;
}

.ahabaha-toggle {
  background: #your-color !important;
}
```

## Working Hours

Configure when your webchat widget is available:

```javascript
workingHours: {
  enabled: true,
  timezone: 'America/New_York',
  schedule: [
    { day: 0, start: '09:00', end: '17:00', enabled: false }, // Sunday
    { day: 1, start: '09:00', end: '17:00', enabled: true },  // Monday
    { day: 2, start: '09:00', end: '17:00', enabled: true },  // Tuesday
    { day: 3, start: '09:00', end: '17:00', enabled: true },  // Wednesday
    { day: 4, start: '09:00', end: '17:00', enabled: true },  // Thursday
    { day: 5, start: '09:00', end: '17:00', enabled: true },  // Friday
    { day: 6, start: '10:00', end: '15:00', enabled: false }  // Saturday
  ]
}
```

## Notifications

Configure how you receive webchat notifications:

```javascript
notifications: {
  sound: true,      // Play sound for new messages
  desktop: false,   // Browser desktop notifications
  email: false      // Email alerts for new conversations
}
```

## Browser Support

The webchat widget supports all modern browsers:

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Mobile Responsiveness

The widget automatically adapts to mobile devices:

- Responsive design for all screen sizes
- Touch-friendly interface
- Optimized for mobile browsers
- Full-screen mode on small devices

## Security Considerations

- All communication is handled through HTTPS
- Visitor IDs are generated client-side
- No sensitive data is stored in localStorage
- API endpoints validate all input data
- Rate limiting is implemented on the server

## Troubleshooting

### Widget Not Loading

1. Check that the script URL is correct
2. Verify your chatbot ID is valid
3. Ensure the page is served over HTTPS
4. Check browser console for JavaScript errors

### Messages Not Sending

1. Verify the API endpoint is accessible
2. Check network tab for failed requests
3. Ensure CORS is properly configured
4. Verify chatbot is enabled and active

### Styling Issues

1. Check for CSS conflicts with your website
2. Verify custom CSS is loaded after the widget
3. Use `!important` for critical style overrides
4. Test in different browsers

## Support

For technical support or questions about the webchat widget:

- Check the [AhaBaha Documentation](https://docs.ahabaha.com)
- Contact our support team at support@ahabaha.com
- Visit our [Community Forum](https://community.ahabaha.com)

## Changelog

### Version 1.0.0
- Initial release
- Basic chat functionality
- Customizable appearance
- Working hours support
- Mobile responsive design



