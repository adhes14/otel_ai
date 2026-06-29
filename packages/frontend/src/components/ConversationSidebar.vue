<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useConversationsStore } from '../stores/conversations.js';
import ConversationListItem from './ConversationListItem.vue';

const store = useConversationsStore();
const observerTarget = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

const refreshList = () => {
  store.fetchConversations();
};

onMounted(() => {
  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && store.nextCursor && !store.loadingList) {
      store.fetchNextPage();
    }
  }, {
    root: null, // viewport
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
        placeholder="Search conversation..." 
        class="search-input" 
      />
      <button class="refresh-btn" @click="refreshList" title="Refresh conversations">
        🔄
      </button>
    </div>

    <div class="conversations-list-wrapper">
      <div v-if="store.loadingList && !store.conversations.length" class="list-message">
        Loading conversations...
      </div>
      
      <div v-else-if="!store.filteredConversations.length" class="list-message">
        No conversations found
      </div>
      
      <div v-else class="list-items">
        <ConversationListItem 
          v-for="item in store.filteredConversations" 
          :key="item.id" 
          :conversation="item" 
        />
        
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

.conversations-list-wrapper {
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
