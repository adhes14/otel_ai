import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api/client.js';
import type { Conversation, ConversationDetail, AtomicSpan } from '../api/client.js';

export const useConversationsStore = defineStore('conversations', () => {
  const conversations = ref<Conversation[]>([]);
  const nextCursor = ref<string | null>(null);
  const selectedId = ref<string | null>(null);
  const selectedAgentName = ref<string | null>(null);
  const selectedDetail = ref<ConversationDetail | null>(null);
  const selectedSpans = ref<AtomicSpan[]>([]);
  
  // Filtering & Search
  const searchQuery = ref('');
  const excludedModels = ref<string[]>([]); // Models that have been unchecked

  // Loading states
  const loadingList = ref(false);
  const loadingDetail = ref(false);
  const error = ref<string | null>(null);

  // Client-side filtered conversations list
  const filteredConversations = computed(() => {
    const query = searchQuery.value.trim().toLowerCase();
    if (!query) return conversations.value;

    return conversations.value.filter(c => {
      const matchId = c.id.toLowerCase().includes(query);
      const matchTitle = c.title?.toLowerCase().includes(query);
      const matchModels = c.models?.some(m => m.toLowerCase().includes(query));
      return matchId || matchTitle || matchModels;
    });
  });

  // Fetch first page of conversations
  const fetchConversations = async () => {
    loadingList.value = true;
    error.value = null;
    try {
      const response = await api.getConversations(20, null);
      conversations.value = response.conversations;
      nextCursor.value = response.next_cursor;
    } catch (err: any) {
      error.value = err.message || 'Failed to fetch conversations';
    } finally {
      loadingList.value = false;
    }
  };

  // Load next page of conversations (infinite scroll)
  const fetchNextPage = async () => {
    if (loadingList.value || !nextCursor.value) return;
    loadingList.value = true;
    error.value = null;
    try {
      const response = await api.getConversations(20, nextCursor.value);
      // Prepend or append depending on cursor pagination.
      // Since it's cursor paginated (cursor contains lastSeenAt, id), we are fetching older ones.
      // So we append to the list.
      // Let's filter out duplicates just in case
      const existingIds = new Set(conversations.value.map(c => c.id));
      const newItems = response.conversations.filter(c => !existingIds.has(c.id));
      conversations.value.push(...newItems);
      nextCursor.value = response.next_cursor;
    } catch (err: any) {
      error.value = err.message || 'Failed to fetch more conversations';
    } finally {
      loadingList.value = false;
    }
  };

  // Select a conversation and load its detail and spans
  const selectConversation = async (id: string, agentName: string | null = null) => {
    selectedId.value = id;
    selectedAgentName.value = agentName;
    loadingDetail.value = true;
    error.value = null;
    excludedModels.value = []; // Reset excluded models filter when switching conversations
    try {
      const [detail, spans] = await Promise.all([
        api.getConversation(id, agentName || undefined),
        api.getConversationSpans(id, agentName || undefined)
      ]);
      selectedDetail.value = detail;
      selectedSpans.value = spans;
    } catch (err: any) {
      error.value = err.message || 'Failed to load conversation details';
      selectedDetail.value = null;
      selectedSpans.value = [];
    } finally {
      loadingDetail.value = false;
    }
  };

  const toggleModelFilter = (modelName: string) => {
    const idx = excludedModels.value.indexOf(modelName);
    if (idx > -1) {
      excludedModels.value.splice(idx, 1);
    } else {
      excludedModels.value.push(modelName);
    }
  };

  const updateTitle = async (id: string, title: string) => {
    try {
      const response = await api.updateConversationTitle(id, title);
      if (selectedDetail.value && selectedDetail.value.id === id) {
        selectedDetail.value.title = response.title;
      }
      const conv = conversations.value.find(c => c.id === id);
      if (conv) {
        conv.title = response.title;
      }
    } catch (err: any) {
      error.value = err.message || 'Failed to update conversation title';
      throw err;
    }
  };

  const deleteConversation = async (id: string) => {
    error.value = null;
    try {
      await api.deleteConversation(id);
      conversations.value = conversations.value.filter(c => c.id !== id);
      if (selectedId.value === id) {
        selectedId.value = null;
        selectedAgentName.value = null;
        selectedDetail.value = null;
        selectedSpans.value = [];
      }
    } catch (err: any) {
      error.value = err.message || 'Failed to delete conversation';
      throw err;
    }
  };

  return {
    conversations,
    nextCursor,
    selectedId,
    selectedAgentName,
    selectedDetail,
    selectedSpans,
    searchQuery,
    excludedModels,
    loadingList,
    loadingDetail,
    error,
    filteredConversations,
    fetchConversations,
    fetchNextPage,
    selectConversation,
    toggleModelFilter,
    updateTitle,
    deleteConversation,
  };
});
