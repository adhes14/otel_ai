import { findAttribute, getAttributeValue } from './helpers.js';

export interface TelemetryResolver {
  resolveSource(): string;
  preScanSpans(spans: any[], traceSessionMap: Map<string, string>, subagentAliasMap: Map<string, string>): void;
  resolveConversationId(
    span: any,
    traceSessionMap: Map<string, string>,
    subagentAliasMap: Map<string, string>
  ): string | null;
}

export class VSCodeTelemetryResolver implements TelemetryResolver {
  resolveSource(): string {
    return 'vscode';
  }

  preScanSpans(spans: any[], traceSessionMap: Map<string, string>, subagentAliasMap: Map<string, string>): void {
    for (const span of spans) {
      const traceId = span.traceId;
      if (!traceId) continue;
      
      const chatSessionId = findAttribute(span.attributes, 'copilot_chat.chat_session_id');
      const sessionId = findAttribute(span.attributes, 'copilot_chat.session_id');
      const genAiConvId = findAttribute(span.attributes, 'gen_ai.conversation.id');
      const parentChatSessionId = findAttribute(span.attributes, 'copilot_chat.parent_chat_session_id');

      const parentSessionId = parentChatSessionId || sessionId;
      if (parentSessionId && chatSessionId && parentSessionId !== chatSessionId) {
        subagentAliasMap.set(chatSessionId, parentSessionId);
      }
      
      let resolvedSessionId = chatSessionId || sessionId;
      if (!resolvedSessionId && (span.name === 'invoke_agent' || span.name?.startsWith('invoke_agent '))) {
        resolvedSessionId = genAiConvId;
      }
      
      if (resolvedSessionId) {
        const existing = traceSessionMap.get(traceId);
        if (!existing || (existing.startsWith('toolu_') && !resolvedSessionId.startsWith('toolu_'))) {
          traceSessionMap.set(traceId, resolvedSessionId);
        }
      }
    }
  }

  resolveConversationId(
    span: any,
    traceSessionMap: Map<string, string>,
    subagentAliasMap: Map<string, string>
  ): string | null {
    let conversationId = findAttribute(span.attributes, 'copilot_chat.chat_session_id') ||
                         findAttribute(span.attributes, 'copilot_chat.session_id');
    
    if (!conversationId && span.traceId) {
      conversationId = traceSessionMap.get(span.traceId);
    }
    
    if (conversationId && subagentAliasMap.has(conversationId)) {
      conversationId = subagentAliasMap.get(conversationId);
    }
    
    return conversationId;
  }
}

export class CopilotCliTelemetryResolver implements TelemetryResolver {
  resolveSource(): string {
    return 'copilot-cli';
  }

  preScanSpans(spans: any[], traceSessionMap: Map<string, string>, subagentAliasMap: Map<string, string>): void {
    // Copilot CLI does not need pre-scan since conversation_id is directly on each chat span.
  }

  resolveConversationId(
    span: any,
    traceSessionMap: Map<string, string>,
    subagentAliasMap: Map<string, string>
  ): string | null {
    return findAttribute(span.attributes, 'gen_ai.conversation.id');
  }
}

export function getTelemetryResolver(payload: any): TelemetryResolver {
  const resourceSpans = payload.resourceSpans;
  if (resourceSpans && Array.isArray(resourceSpans)) {
    for (const r of resourceSpans) {
      const serviceNameAttr = r.resource?.attributes?.find?.((a: any) => a.key === 'service.name');
      if (serviceNameAttr) {
        const serviceName = getAttributeValue(serviceNameAttr);
        if (serviceName === 'github-copilot') {
          return new CopilotCliTelemetryResolver();
        }
      }
    }
  }
  return new VSCodeTelemetryResolver();
}
