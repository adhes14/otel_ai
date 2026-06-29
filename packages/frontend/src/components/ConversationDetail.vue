<script setup lang="ts">
import { computed } from 'vue';
import { useConversationsStore } from '../stores/conversations.js';
import KpiCards from './KpiCards.vue';
import CostDonutChart from './CostDonutChart.vue';
import TokenBarChart from './TokenBarChart.vue';
import ModelCostBadge from './ModelCostBadge.vue';

const store = useConversationsStore();

// Computed properties for filtered data based on selected model pills
const filteredBreakdown = computed(() => {
  if (!store.selectedDetail) return [];
  return store.selectedDetail.model_breakdown.filter(
    item => !store.excludedModels.includes(item.model_name)
  );
});

const filteredSpans = computed(() => {
  if (!store.selectedSpans) return [];
  return store.selectedSpans.filter(
    span => !store.excludedModels.includes(span.model_name)
  );
});

// Check if any active model has 0/unconfigured cost rates
const hasUnconfiguredRates = computed(() => {
  if (!store.selectedDetail) return false;
  return store.selectedDetail.model_breakdown.some(
    item => item.rates.input_cost_per_m === 0 && item.rates.output_cost_per_m === 0
  );
});

const formatDate = (timestamp: number) => {
  return new Date(timestamp).toLocaleString();
};

const toggleModel = (modelName: string) => {
  store.toggleModelFilter(modelName);
};

const isModelExcluded = (modelName: string) => {
  return store.excludedModels.includes(modelName);
};
</script>

<template>
  <div v-if="store.loadingDetail" class="detail-loading-state">
    <div class="loader">Loading conversation metrics...</div>
  </div>
  
  <div v-else-if="store.selectedDetail" class="detail-container fade-in">
    <!-- Header -->
    <div class="detail-header">
      <div class="title-section">
        <h1>{{ store.selectedDetail.title || 'Untitled Session' }}</h1>
        <div class="meta-info">
          <span class="meta-id">ID: <code>{{ store.selectedDetail.id }}</code></span>
          <span class="meta-dot">•</span>
          <span class="meta-time">Active: {{ formatDate(store.selectedDetail.first_seen_at) }} - {{ formatDate(store.selectedDetail.last_seen_at) }}</span>
        </div>
      </div>
      
      <!-- Unconfigured cost warning badge -->
      <ModelCostBadge v-if="hasUnconfiguredRates" />
    </div>

    <!-- Model Filter Checkbox Pills -->
    <div class="model-filters-section">
      <span class="filters-label">Active Models:</span>
      <div class="filter-pills">
        <button 
          v-for="item in store.selectedDetail.model_breakdown" 
          :key="item.model_name"
          class="filter-pill"
          :class="{ 'inactive': isModelExcluded(item.model_name) }"
          @click="toggleModel(item.model_name)"
        >
          <span class="pill-checkbox">{{ isModelExcluded(item.model_name) ? '☐' : '☑' }}</span>
          <span class="pill-name">{{ item.model_name }}</span>
        </button>
      </div>
    </div>

    <!-- KPIs -->
    <div class="kpis-section">
      <KpiCards :breakdown="filteredBreakdown" />
    </div>

    <!-- Charts Area -->
    <div class="charts-grid">
      <!-- Donut Chart: Cost Breakdown -->
      <div class="chart-card">
        <h3>Cost Distribution ($)</h3>
        <div class="chart-wrapper">
          <CostDonutChart :breakdown="filteredBreakdown" />
        </div>
      </div>

      <!-- Bar Chart: Token consumption per span over time -->
      <div class="chart-card">
        <h3>Token Consumption Over Time (Sequential Spans)</h3>
        <div class="chart-wrapper">
          <TokenBarChart :spans="filteredSpans" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--text-muted);
}

.loader {
  animation: pulse 1.5s infinite;
  font-size: 18px;
}

.detail-container {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 24px;
  height: 100%;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 20px;
}

.title-section h1 {
  font-size: 24px;
  margin-bottom: 6px;
}

.meta-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
}

.meta-id code {
  font-size: 11px;
  padding: 2px 4px;
  background-color: var(--bg-surface);
}

.meta-dot {
  color: var(--border);
}

.model-filters-section {
  display: flex;
  align-items: center;
  gap: 12px;
  background-color: var(--bg-surface);
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px solid var(--border);
}

.filters-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.filter-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.filter-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 20px;
  background-color: var(--accent-bg);
  border: 1px solid var(--accent-border);
  color: var(--accent-light);
}

.filter-pill.inactive {
  background-color: transparent;
  border-color: var(--border);
  color: var(--text-muted);
}

.pill-checkbox {
  font-size: 14px;
}

.charts-grid {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: 24px;
  min-height: 380px;
}

.chart-card {
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 20px;
  display: flex;
  flex-direction: column;
}

.chart-card h3 {
  font-size: 15px;
  margin-bottom: 16px;
  color: var(--text-bright);
}

.chart-wrapper {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 280px;
}

@keyframes pulse {
  0% { opacity: 0.5; }
  50% { opacity: 1; }
  100% { opacity: 0.5; }
}

@media (max-width: 1024px) {
  .charts-grid {
    grid-template-columns: 1fr;
  }
}
</style>
