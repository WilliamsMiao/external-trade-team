# WhatsApp Business 获客

## Description
通过WhatsApp Business API发送/接收消息，管理客户沟通

## Triggers
- "发WhatsApp" / "WhatsApp"
- "WhatsApp消息" / "whatsapp message"
- "whatsapp business"

## Action
调用WhatsApp Business API

## Parameters
```json
{
  "action": "send|list|broadcast",
  "to": "+1234567890",
  "message": "你好"
}
```

## Output
返回发送状态或消息列表
