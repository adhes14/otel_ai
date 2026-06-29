export interface Conversation {
  id: string;
  title: string;
  first_seen_at: number;
  last_seen_at: number;
  models: string[];
}

export interface ConversationsResponse {
  conversations: Conversation[];
  next_cursor: string | null;
}

export interface ModelRate {
  input_cost_per_m: number;
  output_cost_per_m: number;
  cache_read_cost_per_m: number;
  cache_write_cost_per_m: number;
  reasoning_cost_per_m: number;
}

export interface ModelCostBreakdown {
  model_name: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
  rates: ModelRate;
  costs: {
    input_cost: number;
    output_cost: number;
    cache_read_cost: number;
    cache_write_cost: number;
    reasoning_cost: number;
    total_cost: number;
  };
}

export interface ConversationDetail {
  id: string;
  title: string;
  first_seen_at: number;
  last_seen_at: number;
  model_breakdown: ModelCostBreakdown[];
}

export interface AtomicSpan {
  id: string;
  conversation_id: string;
  model_name: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
  created_at: number;
}

export interface ModelCost {
  model_name: string;
  input_cost_per_m: number;
  output_cost_per_m: number;
  cache_read_cost_per_m: number;
  cache_write_cost_per_m: number;
  reasoning_cost_per_m: number;
  created_at?: string;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  getConversations: (limit = 20, cursor: string | null = null) => {
    let url = `/api/conversations?limit=${limit}`;
    if (cursor) {
      url += `&cursor=${encodeURIComponent(cursor)}`;
    }
    return request<ConversationsResponse>(url);
  },

  getConversation: (id: string) => {
    return request<ConversationDetail>(`/api/conversations/${encodeURIComponent(id)}`);
  },

  getConversationSpans: (id: string) => {
    return request<AtomicSpan[]>(`/api/conversations/${encodeURIComponent(id)}/spans`);
  },

  getModelCosts: () => {
    return request<ModelCost[]>('/api/model-costs');
  },

  createModelCost: (cost: Omit<ModelCost, 'created_at'>) => {
    return request<{ status: string; model_name: string }>('/api/model-costs', {
      method: 'POST',
      body: JSON.stringify(cost),
    });
  },

  updateModelCost: (modelName: string, cost: Omit<ModelCost, 'model_name' | 'created_at'>) => {
    return request<{ status: string; model_name: string }>(`/api/model-costs/${encodeURIComponent(modelName)}`, {
      method: 'PUT',
      body: JSON.stringify(cost),
    });
  },

  deleteModelCost: (modelName: string) => {
    return request<{ status: string; model_name: string }>(`/api/model-costs/${encodeURIComponent(modelName)}`, {
      method: 'DELETE',
    });
  },
};
