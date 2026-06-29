<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRawTelemetryStore } from '../stores/rawTelemetry.js';

const store = useRawTelemetryStore();
const observerTarget = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

const refreshList = () => {
  store.fetchTelemetries(true);
};

const selectThis = (id: number) => {
  store.selectTelemetry(id);
};

const formatDate = (timestamp: number) => {
  const diff = Date.now() - timestamp * 1000;
  const secs = Math.max(0, Math.floor(diff / 1000));
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (secs < 60) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
};

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

onMounted(() => {
  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && store.nextCursor && !store.loadingList) {
      store.fetchNextPage();
    }
  }, {
    root: null,
    rootMargin: '100px',
    threshold: 0.1
  });

  if (observerTarget.value) {
    observer.observe(observerTarget.value);
  }
});

onUnmounted(() => {
  if (observer) {
    observer.disconnect();
  }
});
</script>

<template>
  <div class="sidebar-container">
    <div class="sidebar-search-bar">
      <input 
        v-model="store.searchQuery" 
        placeholder="Search telemetry..." 
        class="search-input" 
      />
      <button class="refresh-btn" @click="refreshList" title="Refresh telemetry">
        🔄
      </button>
    </div>

    <div class="telemetry-list-wrapper">
      <div v-if="store.loadingList && !store.telemetries.length" class="list-message">
        Loading telemetries...
      </div>
      
      <div v-else-if="!store.telemetries.length" class="list-message">
        No telemetries found
      </div>
      
      <div v-else class="list-items">
        <div 
          v-for="item in store.telemetries" 
          :key="item.id"
          class="list-item"
          :class="{ 'selected': store.selectedId === item.id }"
          @click="selectThis(item.id)"
        >
          <div class="item-header">
            <span class="item-title">#{{ item.id }}</span>
            <span class="item-time">{{ formatDate(item.created_at) }}</span>
          </div>
          
          <div class="item-body">
            <span v-if="item.conversation_id" class="item-conv-id" :title="item.conversation_id">
              Conv: {{ item.conversation_id.substring(0, 8) }}...
            </span>
            <span v-else class="item-conv-none">
              Sin conversación
            </span>
          </div>

          <div class="item-footer">
            <span class="item-size">{{ formatSize(item.payload_size) }}</span>
          </div>
        </div>
        
        <!-- Infinite scroll trigger -->
        <div ref="observerTarget" class="scroll-trigger">
          <span v-if="store.loadingList" class="loading-more">Loading more...</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sidebar-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.sidebar-search-bar {
  display: flex;
  gap: 8px;
  padding: 16px;
  border-bottom: 1px solid var(--border);
  background-color: rgba(0, 0, 0, 0.05);
}

.search-input {
  flex: 1;
  background-color: var(--bg);
}

.refresh-btn {
  padding: 8px 12px;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.telemetry-list-wrapper {
  flex: 1;
  overflow-y: auto;
}

.list-message {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-muted);
}

.list-items {
  display: flex;
  flex-direction: column;
}

.list-item {
  padding: 16px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.list-item:hover {
  background-color: var(--bg-surface-hover);
}

.list-item.selected {
  background-color: var(--bg-surface-active);
  border-left: 4px solid var(--accent);
  padding-left: 12px;
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.item-title {
  font-weight: 600;
  color: var(--text-bright);
  font-size: 14px;
}

.item-time {
  font-size: 11px;
  color: var(--text-muted);
}

.item-body {
  font-size: 12px;
}

.item-conv-id {
  color: var(--accent-light);
  font-family: var(--mono);
}

.item-conv-none {
  color: var(--text-muted);
  font-style: italic;
}

.item-footer {
  display: flex;
  justify-content: flex-end;
}

.item-size {
  font-size: 11px;
  color: var(--text-muted);
}

.scroll-trigger {
  padding: 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
}

.loading-more {
  display: inline-block;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% { opacity: 0.5; }
  50% { opacity: 1; }
  100% { opacity: 0.5; }
}
</style>
