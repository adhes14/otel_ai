<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useRawTelemetryStore } from '../stores/rawTelemetry.js';
import RawTelemetrySidebar from '../components/RawTelemetrySidebar.vue';
import RawTelemetryDetail from '../components/RawTelemetryDetail.vue';

const store = useRawTelemetryStore();
const route = useRoute();

const handleRouteId = () => {
  const idStr = route.query.id;
  if (idStr) {
    const id = Number(idStr);
    if (!isNaN(id)) {
      store.selectTelemetry(id);
    }
  }
};

const handleRouteParams = async (isInitial = false) => {
  const convId = route.query.conversation_id;
  const newQuery = convId ? String(convId) : '';
  
  if (store.searchQuery !== newQuery) {
    store.searchQuery = newQuery;
  } else if (isInitial) {
    await store.fetchTelemetries(true);
  }
  handleRouteId();
};

onMounted(async () => {
  await handleRouteParams(true);
});

watch(() => route.query.conversation_id, () => {
  handleRouteParams();
});

watch(() => route.query.id, () => {
  handleRouteId();
});
</script>

<template>
  <div class="telemetry-view-layout">
    <aside class="sidebar-wrapper no-print">
      <RawTelemetrySidebar />
    </aside>
    <main class="detail-wrapper">
      <RawTelemetryDetail />
    </main>
  </div>
</template>

<style scoped>
.telemetry-view-layout {
  display: flex;
  flex: 1;
  height: calc(100vh - 65px); /* Header height compensation */
  overflow: hidden;
}

.sidebar-wrapper {
  width: 320px;
  border-right: 1px solid var(--border);
  background-color: var(--bg-surface);
  flex-shrink: 0;
  height: 100%;
}

.detail-wrapper {
  flex: 1;
  height: 100%;
  background-color: var(--bg);
  display: flex;
  flex-direction: column;
}
</style>
