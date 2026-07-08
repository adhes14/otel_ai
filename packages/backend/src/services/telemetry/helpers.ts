export function getAttributeValue(attr: any): any {
  if (!attr || attr.value === undefined || attr.value === null) return null;
  const val = attr.value;
  if (typeof val !== 'object') {
    return val;
  }
  if ('stringValue' in val) return val.stringValue;
  if ('intValue' in val) return Number(val.intValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('boolValue' in val) return val.boolValue;
  if ('value' in val) return val.value;
  return null;
}

export function findAttribute(attributes: any[] | undefined, key: string): any {
  const attr = attributes?.find?.(a => a.key === key);
  return attr ? getAttributeValue(attr) : null;
}

export function extractPromptFromRequest(userReqStr: string): string | null {
  if (!userReqStr) return null;
  let text = userReqStr.trim();
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      const item = parsed.find(i => i.type === 'input_text' && typeof i.text === 'string');
      if (item) text = item.text;
    }
  } catch {}

  const match = text.match(/<userRequest>([\s\S]*?)<\/userRequest>/i);
  let prompt = (match ? match[1] : text)
    .replace(/\\n/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  if (prompt.length > 60) {
    prompt = prompt.slice(0, 57) + '...';
  }
  return prompt || null;
}

export function extractPromptFromOpencode(promptMessagesStr: string): string | null {
  if (!promptMessagesStr) return null;
  try {
    const messages = JSON.parse(promptMessagesStr);
    if (Array.isArray(messages)) {
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg && msg.role === 'user') {
          let text = '';
          if (typeof msg.content === 'string') {
            text = msg.content;
          } else if (Array.isArray(msg.content)) {
            const textPart = msg.content.find((p: any) => p && typeof p.text === 'string');
            if (textPart) {
              text = textPart.text;
            }
          }
          
          let cleaned = text
            .replace(/\\n/g, ' ')
            .replace(/[\r\n\t]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          
          if (cleaned.length > 60) {
            cleaned = cleaned.slice(0, 57) + '...';
          }
          return cleaned || null;
        }
      }
    }
  } catch (err) {
    // Fail silently
  }
  return null;
}

export function extractTitleFromVSCodeOutput(outputMsgsStr: string): string | null {
  if (!outputMsgsStr) return null;
  try {
    const messages = JSON.parse(outputMsgsStr);
    if (Array.isArray(messages)) {
      const assistantMsg = messages.find(m => m && m.role === 'assistant');
      if (assistantMsg && Array.isArray(assistantMsg.parts)) {
        const textPart = assistantMsg.parts.find((p: any) => p && p.type === 'text' && typeof p.content === 'string');
        if (textPart) {
          return textPart.content.trim();
        }
      }
    }
  } catch (err) {
    // Fail silently
  }
  return null;
}

