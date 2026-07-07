import { findAttribute, getAttributeValue, extractPromptFromRequest, extractPromptFromOpencode } from './helpers.js';
import logger from '../../utils/logger.js';

export interface ProcessableSpan {
  conversationId: string;
  spanId: string;
  modelName: string;
  agentName: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  createdAt: number;      // Unix seconds
  fallbackTitle: string | null;
}

export interface TelemetryResolver {
  resolveSource(): string;
  resolveReasoningTokenKey(): string;
  preScanSpans(spans: any[], traceSessionMap: Map<string, string>, subagentAliasMap: Map<string, string>): void;
  resolveConversationId(
    span: any,
    traceSessionMap: Map<string, string>,
    subagentAliasMap: Map<string, string>
  ): string | null;
  resolveSpans(
    spans: any[],
    traceSessionMap: Map<string, string>,
    subagentAliasMap: Map<string, string>
  ): ProcessableSpan[];

  // Strategy methods for agent categorization & formatting
  isSubagent(agentName: string): boolean;
  cleanAgentNameForDb(agentName: string): string;
  formatAgentNameForApi(agentName: string): string;
  getAgentFilterSql(agentName: string): { sql: string; params: any[] };
  getAgentsForApi(agentsFromDb: string[]): string[];
}

function extractCreatedAt(span: any): number {
  const now = Math.floor(Date.now() / 1000);
  let spanTimeSec = now;
  const timeNano = span.startTimeUnixNano || span.start_time_unix_nano || span.timeUnixNano || span.time_unix_nano;
  if (timeNano) {
    try {
      spanTimeSec = Math.floor(Number(BigInt(timeNano) / 1000000000n));
    } catch {
      const num = Number(timeNano);
      if (!isNaN(num)) {
        spanTimeSec = num > 1e11 ? Math.floor(num / 1000) : num;
      }
    }
  }
  return spanTimeSec;
}

function mapSpanToProcessable(
  span: any,
  resolver: TelemetryResolver,
  conversationId: string
): ProcessableSpan {
  const spanId = span.spanId || span.span_id || `gen-${Math.random().toString(36).substring(2, 11)}`;
  const modelName = findAttribute(span.attributes, 'gen_ai.response.model') || 
                    findAttribute(span.attributes, 'gen_ai.request.model') || 
                    'unknown-model';
  const agentName = findAttribute(span.attributes, 'gen_ai.agent.name');

  const inputTokens = Number(findAttribute(span.attributes, 'gen_ai.usage.input_tokens') ?? 0);
  const outputTokens = Number(findAttribute(span.attributes, 'gen_ai.usage.output_tokens') ?? 0);
  const cacheReadTokens = Number(findAttribute(span.attributes, 'gen_ai.usage.cache_read.input_tokens') ?? 0);
  const cacheWriteTokens = Number(findAttribute(span.attributes, 'gen_ai.usage.cache_creation.input_tokens') ?? 0);
  const reasoningTokens = Number(findAttribute(span.attributes, resolver.resolveReasoningTokenKey()) ?? 0);

  const userRequest = findAttribute(span.attributes, 'copilot_chat.user_request');
  let fallbackTitle: string | null = null;
  if (typeof userRequest === 'string') {
    fallbackTitle = extractPromptFromRequest(userRequest);
  }

  const createdAt = extractCreatedAt(span);

  return {
    conversationId,
    spanId,
    modelName,
    agentName,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    reasoningTokens,
    createdAt,
    fallbackTitle
  };
}

export class VSCodeTelemetryResolver implements TelemetryResolver {
  resolveSource(): string {
    return 'vscode';
  }

  resolveReasoningTokenKey(): string {
    return 'gen_ai.usage.reasoning_tokens';
  }

  isSubagent(agentName: string): boolean {
    return agentName.startsWith('tool/runSubagent-');
  }

  cleanAgentNameForDb(agentName: string): string {
    return agentName;
  }

  formatAgentNameForApi(agentName: string): string {
    return agentName;
  }

  getAgentFilterSql(agentName: string): { sql: string; params: any[] } {
    if (this.isSubagent(agentName)) {
      return {
        sql: 's.agent_name = ?',
        params: [agentName]
      };
    } else {
      return {
        sql: "(s.agent_name NOT LIKE 'tool/runSubagent-%' OR s.agent_name IS NULL)",
        params: []
      };
    }
  }

  getAgentsForApi(agentsFromDb: string[]): string[] {
    return agentsFromDb;
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

  resolveSpans(
    spans: any[],
    traceSessionMap: Map<string, string>,
    subagentAliasMap: Map<string, string>
  ): ProcessableSpan[] {
    const result: ProcessableSpan[] = [];
    for (const span of spans) {
      if (span.name !== 'chat' && !span.name.startsWith('chat ')) {
        continue;
      }
      const conversationId = this.resolveConversationId(span, traceSessionMap, subagentAliasMap);
      if (!conversationId) {
        continue;
      }
      result.push(mapSpanToProcessable(span, this, conversationId));
    }
    return result;
  }
}

export class CopilotCliTelemetryResolver implements TelemetryResolver {
  resolveSource(): string {
    return 'copilot-cli';
  }

  resolveReasoningTokenKey(): string {
    return 'gen_ai.usage.reasoning.output_tokens';
  }

  isSubagent(agentName: string): boolean {
    if (agentName === 'orchestrator') return false;
    return agentName.startsWith('tool/runSubagent-') || agentName !== '';
  }

  cleanAgentNameForDb(agentName: string): string {
    if (agentName.startsWith('tool/runSubagent-')) {
      return agentName.substring('tool/runSubagent-'.length);
    }
    return agentName;
  }

  formatAgentNameForApi(agentName: string): string {
    if (agentName && !agentName.startsWith('tool/runSubagent-')) {
      return `tool/runSubagent-${agentName}`;
    }
    return agentName;
  }

  getAgentFilterSql(agentName: string): { sql: string; params: any[] } {
    if (this.isSubagent(agentName)) {
      const dbAgentName = this.cleanAgentNameForDb(agentName);
      return {
        sql: 's.agent_name = ?',
        params: [dbAgentName]
      };
    } else {
      return {
        sql: 's.agent_name IS NULL',
        params: []
      };
    }
  }

  getAgentsForApi(agentsFromDb: string[]): string[] {
    const formatted = agentsFromDb.map(a => this.formatAgentNameForApi(a));
    if (formatted.length > 0) {
      formatted.push('orchestrator');
    }
    return formatted;
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

  resolveSpans(
    spans: any[],
    traceSessionMap: Map<string, string>,
    subagentAliasMap: Map<string, string>
  ): ProcessableSpan[] {
    const result: ProcessableSpan[] = [];
    
    // Step 1: Identify all agent invocation span IDs to filter out their child chat spans
    const agentSpanIds = new Set<string>();
    for (const span of spans) {
      if (span.name === 'invoke_agent' || span.name?.startsWith('invoke_agent ')) {
        if (span.spanId) {
          agentSpanIds.add(span.spanId);
        }
      }
    }

    // Step 2: Process spans
    for (const span of spans) {
      const isAgent = span.name === 'invoke_agent' || span.name?.startsWith('invoke_agent ');
      const isChat = span.name === 'chat' || span.name?.startsWith('chat ');
      
      if (!isAgent && !isChat) {
        continue;
      }

      // If it's a chat span and its parent is an invoke_agent span, skip it (delegated to agent span)
      if (isChat && span.parentSpanId && agentSpanIds.has(span.parentSpanId)) {
        continue;
      }

      const conversationId = this.resolveConversationId(span, traceSessionMap, subagentAliasMap);
      if (!conversationId) {
        continue;
      }

      result.push(mapSpanToProcessable(span, this, conversationId));
    }

    return result;
  }
}

function isTitleGeneratorSpan(span: any): boolean {
  if (span.name !== 'ai.streamText') return false;
  const prompt = findAttribute(span.attributes, 'ai.prompt') ||
                 findAttribute(span.attributes, 'ai.prompt.messages');
  if (typeof prompt === 'string') {
    return prompt.includes('title generator') || prompt.includes('thread title');
  }
  return false;
}

export class OpencodeTelemetryResolver implements TelemetryResolver {
  resolveSource(): string {
    return 'opencode';
  }

  resolveReasoningTokenKey(): string {
    return 'ai.usage.reasoningTokens';
  }

  isSubagent(agentName: string): boolean {
    return false;
  }

  cleanAgentNameForDb(agentName: string): string {
    return agentName;
  }

  formatAgentNameForApi(agentName: string): string {
    return agentName;
  }

  getAgentFilterSql(agentName: string): { sql: string; params: any[] } {
    return {
      sql: 's.agent_name IS NULL',
      params: []
    };
  }

  getAgentsForApi(agentsFromDb: string[]): string[] {
    return agentsFromDb;
  }

  preScanSpans(spans: any[], traceSessionMap: Map<string, string>, subagentAliasMap: Map<string, string>): void {
    for (const span of spans) {
      if (span.traceId) {
        const conversationId = findAttribute(span.attributes, 'session.id') ||
                               findAttribute(span.attributes, 'ai.telemetry.metadata.sessionId') ||
                               findAttribute(span.attributes, 'ai.request.headers.x-opencode-session');
        if (conversationId) {
          traceSessionMap.set(span.traceId, conversationId);
        }
      }
    }
  }

  resolveConversationId(
    span: any,
    traceSessionMap: Map<string, string>,
    subagentAliasMap: Map<string, string>
  ): string | null {
    let conversationId = findAttribute(span.attributes, 'session.id') ||
                         findAttribute(span.attributes, 'ai.telemetry.metadata.sessionId') ||
                         findAttribute(span.attributes, 'ai.request.headers.x-opencode-session');
    
    if (!conversationId && span.traceId) {
      conversationId = traceSessionMap.get(span.traceId);
    }
    
    return conversationId || null;
  }

  resolveSpans(
    spans: any[],
    traceSessionMap: Map<string, string>,
    subagentAliasMap: Map<string, string>
  ): ProcessableSpan[] {
    const result: ProcessableSpan[] = [];

    // 1. Detect if there is a generated title span
    let generatedTitle: string | null = null;
    for (const span of spans) {
      if (isTitleGeneratorSpan(span)) {
        const titleText = findAttribute(span.attributes, 'ai.response.text');
        if (typeof titleText === 'string' && titleText.trim()) {
          generatedTitle = titleText.trim();
        }
        break;
      }
    }

    // 2. Map the main streamText spans
    for (const span of spans) {
      if (span.name !== 'ai.streamText') {
        continue;
      }
      // Skip the title generator span itself (Option A)
      if (isTitleGeneratorSpan(span)) {
        continue;
      }

      const conversationId = this.resolveConversationId(span, traceSessionMap, subagentAliasMap);
      if (!conversationId) {
        continue;
      }

      const spanId = span.spanId || span.span_id || `gen-${Math.random().toString(36).substring(2, 11)}`;
      const modelName = findAttribute(span.attributes, 'gen_ai.response.model') || 
                        findAttribute(span.attributes, 'gen_ai.request.model') || 
                        findAttribute(span.attributes, 'ai.model.id') ||
                        'unknown-model';
      
      const agentName = null;

      const inputTokens = Number(
        findAttribute(span.attributes, 'gen_ai.usage.input_tokens') ?? 
        findAttribute(span.attributes, 'ai.usage.inputTokens') ?? 
        0
      );
      const outputTokens = Number(
        findAttribute(span.attributes, 'gen_ai.usage.output_tokens') ?? 
        findAttribute(span.attributes, 'ai.usage.outputTokens') ?? 
        0
      );
      const cacheReadTokens = Number(
        findAttribute(span.attributes, 'ai.usage.inputTokenDetails.cacheReadTokens') ?? 
        findAttribute(span.attributes, 'ai.usage.cachedInputTokens') ?? 
        findAttribute(span.attributes, 'gen_ai.usage.cache_read.input_tokens') ?? 
        0
      );
      const cacheWriteTokens = Number(
        findAttribute(span.attributes, 'gen_ai.usage.cache_creation.input_tokens') ?? 
        0
      );
      const reasoningTokens = Number(
        findAttribute(span.attributes, 'ai.usage.reasoningTokens') ?? 
        findAttribute(span.attributes, 'ai.usage.outputTokenDetails.reasoningTokens') ?? 
        0
      );

      let fallbackTitle = generatedTitle;
      if (!fallbackTitle) {
        const promptMessages = findAttribute(span.attributes, 'ai.prompt.messages');
        if (typeof promptMessages === 'string') {
          fallbackTitle = extractPromptFromOpencode(promptMessages);
        }
      }

      const createdAt = extractCreatedAt(span);

      result.push({
        conversationId,
        spanId,
        modelName,
        agentName,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
        reasoningTokens,
        createdAt,
        fallbackTitle
      });
    }

    return result;
  }
}

const RESOLVER_REGISTRY: Record<string, () => TelemetryResolver> = {
  'github-copilot': () => new CopilotCliTelemetryResolver(),
  'copilot-cli': () => new CopilotCliTelemetryResolver(),
  'copilot-chat': () => new VSCodeTelemetryResolver(),
  'vscode': () => new VSCodeTelemetryResolver(),
  'opencode': () => new OpencodeTelemetryResolver(),
};

export function getTelemetryResolver(payload: any): TelemetryResolver {
  const resourceSpans = payload.resourceSpans;
  if (resourceSpans && Array.isArray(resourceSpans)) {
    for (const r of resourceSpans) {
      const serviceNameAttr = r.resource?.attributes?.find?.((a: any) => a.key === 'service.name');
      if (serviceNameAttr) {
        const serviceName = getAttributeValue(serviceNameAttr);
        if (serviceName) {
          const creator = RESOLVER_REGISTRY[serviceName];
          if (creator) {
            return creator();
          } else {
            logger.warn({ serviceName }, 'Unknown service name in telemetry, falling back to VSCodeTelemetryResolver');
          }
        }
      }
    }
  }
  return new VSCodeTelemetryResolver();
}

export function getTelemetryResolverBySource(source: string): TelemetryResolver {
  const creator = RESOLVER_REGISTRY[source];
  if (creator) {
    return creator();
  }
  return new VSCodeTelemetryResolver();
}


