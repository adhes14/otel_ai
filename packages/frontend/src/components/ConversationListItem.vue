<script setup lang="ts">
import { computed } from 'vue';
import { useConversationsStore } from '../stores/conversations.js';
import type { Conversation } from '../api/client.js';

const props = defineProps<{
  conversation: Conversation;
}>();

const store = useConversationsStore();

const isSelected = computed(() => store.selectedId === props.conversation.id);

const shortId = computed(() => {
  return props.conversation.id.substring(0, 8);
});

const relativeTime = computed(() => {
  const diff = Date.now() - props.conversation.last_seen_at;
  const secs = Math.floor(diff / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (secs < 60) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
});

const selectThis = () => {
  store.selectConversation(props.conversation.id);
};
</script>

<template>
  <div 
    class="list-item" 
    :class="{ 'selected': isSelected }"
    @click="selectThis"
  >
    <div class="item-header">
      <span class="item-title" :title="props.conversation.title || 'Untitled Session'">
        {{ props.conversation.title || 'Untitled Session' }}
      </span>
      <span class="item-time">{{ relativeTime }}</span>
    </div>
    
    <div class="item-footer">
      <span class="item-id">#{{ shortId }}</span>
      <div class="model-badges">
        <span 
          v-for="model in props.conversation.models" 
          :key="model" 
          class="badge badge-accent model-badge"
        >
          {{ model }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.list-item {
  padding: 16px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.list-item:hover {
  background-color: var(--bg-surface-hover);
}

.list-item.selected {
  background-color: var(--bg-surface-active);
  border-left: 4px solid var(--accent);
  padding-left: 12px; /* maintain overall padding alignment */
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.item-title {
  font-weight: 600;
  color: var(--text-bright);
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.item-time {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}

.item-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.item-id {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-muted);
}

.model-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: flex-end;
}

.model-badge {
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 4px;
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
