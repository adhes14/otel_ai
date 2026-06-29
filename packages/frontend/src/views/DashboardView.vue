<script setup lang="ts">
import { onMounted } from 'vue';
import { useConversationsStore } from '../stores/conversations.js';
import ConversationSidebar from '../components/ConversationSidebar.vue';
import ConversationDetail from '../components/ConversationDetail.vue';

const store = useConversationsStore();

onMounted(() => {
  store.fetchConversations();
});
</script>

<template>
  <div class="dashboard-layout fade-in">
    <aside class="sidebar-wrapper">
      <ConversationSidebar />
    </aside>
    <section class="detail-wrapper">
      <ConversationDetail v-if="store.selectedId" />
      <div v-else class="empty-state">
        <div class="empty-state-content">
          <span class="empty-emoji">💬</span>
          <h2>Select a conversation</h2>
          <p>Choose a session from the list on the left to view detailed token and cost analysis.</p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dashboard-layout {
  display: grid;
  grid-template-columns: 360px 1fr;
  flex: 1;
  overflow: hidden;
  height: calc(100vh - 65px); /* viewport minus header height */
}

.sidebar-wrapper {
  border-right: 1px solid var(--border);
  background-color: var(--bg-surface);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.detail-wrapper {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--bg);
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 48px;
  text-align: center;
}

.empty-state-content {
  max-width: 400px;
}

.empty-emoji {
  font-size: 64px;
  display: block;
  margin-bottom: 24px;
}

.empty-state-content h2 {
  font-size: 24px;
  margin-bottom: 8px;
}

.empty-state-content p {
  color: var(--text-muted);
  line-height: 1.5;
}

@media (max-width: 768px) {
  .dashboard-layout {
    grid-template-columns: 1fr;
  }
  .sidebar-wrapper {
    display: none; /* simple responsive fallback for now */
  }
}
</style>
