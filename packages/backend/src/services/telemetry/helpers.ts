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
