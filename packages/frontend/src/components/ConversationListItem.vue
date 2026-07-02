<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useConversationsStore } from '../stores/conversations.js';
import type { Conversation } from '../api/client.js';

const props = defineProps<{
  conversation: Conversation;
}>();

const store = useConversationsStore();

const isSelected = computed(() => store.selectedId === props.conversation.id);

const subagents = computed(() => {
  if (!props.conversation.agents) return [];
  return props.conversation.agents.filter(a => a.startsWith('tool/runSubagent-'));
});

const orchestratorAgent = computed(() => {
  if (!props.conversation.agents) return null;
  return props.conversation.agents.find(a => !a.startsWith('tool/runSubagent-')) || null;
});

const hasSubagents = computed(() => subagents.value.length > 0);

const isExpanded = ref(false);

// Auto-expand when conversation is selected
watch(isSelected, (newVal) => {
  if (newVal && hasSubagents.value) {
    isExpanded.value = true;
  }
}, { immediate: true });

const shortId = computed(() => {
  return props.conversation.id.substring(0, 8);
});

const relativeTime = computed(() => {
  const diff = Date.now() - props.conversation.last_seen_at * 1000;
  const secs = Math.max(0, Math.floor(diff / 1000));
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (secs < 60) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
});

const toggleExpand = () => {
  isExpanded.value = !isExpanded.value;
};

const selectRoot = () => {
  store.selectConversation(props.conversation.id, null);
};

const selectAgent = (agentName: string | null) => {
  store.selectConversation(props.conversation.id, agentName);
};

const cleanAgentName = (name: string) => {
  if (name.startsWith('tool/runSubagent-')) {
    return name.substring('tool/runSubagent-'.length);
  }
  return name;
};
</script>

<template>
  <div class="conversation-item-group">
    <!-- Root item -->
    <div 
      class="list-item" 
      :class="{ 
        'selected': isSelected && !store.selectedAgentName,
        'has-subagents': hasSubagents
      }"
      @click="selectRoot"
    >
      <div class="item-header">
        <span 
          v-if="hasSubagents" 
          class="expand-chevron" 
          @click.stop="toggleExpand"
        >
          {{ isExpanded ? '▼' : '▶' }}
        </span>
        <span class="item-title" :title="props.conversation.title || 'Untitled Session'">
          {{ props.conversation.title || 'Untitled Session' }}
        </span>
        <span class="item-time">{{ relativeTime }}</span>
      </div>
      
      <div class="item-footer" :class="{ 'with-chevron': hasSubagents }">
        <span class="item-id">#{{ shortId }}</span>
        <div class="source-badges">
          <span 
            v-if="props.conversation.source === 'vscode'" 
            class="badge badge-vscode source-badge"
          >
            VS Code
          </span>
          <span 
            v-else-if="props.conversation.source === 'copilot-cli'" 
            class="badge badge-copilot-cli source-badge"
          >
            Copilot CLI
          </span>
          <span 
            v-else
            class="badge badge-unknown source-badge"
          >
            {{ props.conversation.source || 'VS Code' }}
          </span>
        </div>
      </div>
    </div>

    <!-- Sub-items list -->
    <div v-if="hasSubagents && isExpanded" class="sub-items-container">
      <!-- Orchestrator Sub-item -->
      <div 
        class="sub-item"
        :class="{ 'selected': isSelected && store.selectedAgentName === orchestratorAgent }"
        @click="selectAgent(orchestratorAgent)"
      >
        <span class="sub-item-icon">⚙️</span>
        <span class="sub-item-name">{{ orchestratorAgent ? cleanAgentName(orchestratorAgent) : 'Orchestrator' }}</span>
      </div>

      <!-- Subagent Sub-items -->
      <div 
        v-for="agent in subagents" 
        :key="agent"
        class="sub-item"
        :class="{ 'selected': isSelected && store.selectedAgentName === agent }"
        @click="selectAgent(agent)"
      >
        <span class="sub-item-icon">🤖</span>
        <span class="sub-item-name">{{ cleanAgentName(agent) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.conversation-item-group {
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid var(--border);
}

.list-item {
  padding: 16px;
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
  align-items: center;
  gap: 8px;
}

.expand-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 10px;
  transition: transform 0.2s ease;
}

.expand-chevron:hover {
  color: var(--text-bright);
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

.item-footer.with-chevron {
  padding-left: 24px;
}

.item-id {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-muted);
}

.source-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: flex-end;
}

.source-badge {
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 4px;
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sub-items-container {
  padding-left: 12px;
  padding-right: 12px;
  padding-bottom: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-left: 2px solid var(--border);
  margin-left: 22px;
  margin-top: -2px;
  margin-bottom: 8px;
}

.sub-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 13px;
  color: var(--text-muted);
}

.sub-item:hover {
  background-color: var(--bg-surface-hover);
  color: var(--text-bright);
}

.sub-item.selected {
  background-color: var(--bg-surface-active);
  border-left: 3px solid var(--accent);
  padding-left: 9px;
  color: var(--text-bright);
  font-weight: 500;
}

.sub-item-icon {
  font-size: 13px;
}

.sub-item-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
