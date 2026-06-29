<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useConversationsStore } from '../stores/conversations.js';
import KpiCards from './KpiCards.vue';
import CostDonutChart from './CostDonutChart.vue';
import TokenBarChart from './TokenBarChart.vue';
import ModelCostBadge from './ModelCostBadge.vue';
import { api } from '../api/client.js';
import type { ConversationRawTelemetry } from '../api/client.js';

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

// Computed totals for print view and markdown export
const totalInputTokens = computed(() => {
  return filteredBreakdown.value.reduce((sum, item) => sum + item.input_tokens, 0);
});
const totalOutputTokens = computed(() => {
  return filteredBreakdown.value.reduce((sum, item) => sum + item.output_tokens, 0);
});
const totalCacheReadTokens = computed(() => {
  return filteredBreakdown.value.reduce((sum, item) => sum + item.cache_read_tokens, 0);
});
const totalReasoningTokens = computed(() => {
  return filteredBreakdown.value.reduce((sum, item) => sum + item.reasoning_tokens, 0);
});
const totalCost = computed(() => {
  return filteredBreakdown.value.reduce((sum, item) => sum + item.costs.total_cost, 0);
});
const savingsFromCaching = computed(() => {
  return filteredBreakdown.value.reduce((sum, item) => {
    const normalRate = Number(item.rates.input_cost_per_m || 0);
    const cacheRate = Number(item.rates.cache_read_cost_per_m || 0);
    const cacheReadTokens = Number(item.cache_read_tokens || 0);
    const savings = (cacheReadTokens * (normalRate - cacheRate)) / 1_000_000;
    return sum + (savings > 0 ? savings : 0);
  }, 0);
});

// Date formatting helper (input timestamp is in Unix seconds, convert to ms)
const formatDate = (timestamp: number) => {
  return new Date(timestamp * 1000).toLocaleString();
};

// Title edit state and logic
const isEditing = ref(false);
const editTitleVal = ref('');
const titleInput = ref<HTMLInputElement | null>(null);

// Delete state
const showDeleteModal = ref(false);
const isDeleting = ref(false);

// Raw Telemetries state
const conversationTelemetries = ref<ConversationRawTelemetry[]>([]);
const loadingTelemetries = ref(false);
const showTelemetriesSection = ref(false);

const loadConversationTelemetries = async (id: string) => {
  loadingTelemetries.value = true;
  try {
    conversationTelemetries.value = await api.getConversationRawTelemetries(id);
  } catch (err) {
    console.error('Failed to load conversation telemetries:', err);
    conversationTelemetries.value = [];
  } finally {
    loadingTelemetries.value = false;
  }
};

const toggleTelemetriesSection = () => {
  showTelemetriesSection.value = !showTelemetriesSection.value;
};

const confirmDelete = () => {
  showDeleteModal.value = true;
};

const cancelDelete = () => {
  showDeleteModal.value = false;
};

const handleDelete = async () => {
  if (!store.selectedId) return;
  isDeleting.value = true;
  try {
    await store.deleteConversation(store.selectedId);
    showDeleteModal.value = false;
  } catch (err) {
    console.error('Failed to delete conversation:', err);
  } finally {
    isDeleting.value = false;
  }
};

watch(() => store.selectedId, (newId) => {
  isEditing.value = false;
  showDeleteModal.value = false;
  showTelemetriesSection.value = false;
  if (newId) {
    loadConversationTelemetries(newId);
  } else {
    conversationTelemetries.value = [];
  }
}, { immediate: true });

const startEdit = () => {
  editTitleVal.value = store.selectedDetail?.title || 'Untitled Session';
  isEditing.value = true;
  setTimeout(() => {
    titleInput.value?.focus();
    titleInput.value?.select();
  }, 50);
};

const saveEdit = async () => {
  if (!isEditing.value || !store.selectedDetail) return;
  const newTitle = editTitleVal.value.trim();
  if (newTitle && newTitle !== store.selectedDetail.title) {
    try {
      await store.updateTitle(store.selectedDetail.id, newTitle);
    } catch (err) {
      console.error(err);
    }
  }
  isEditing.value = false;
};

const cancelEdit = () => {
  isEditing.value = false;
};

const toggleModel = (modelName: string) => {
  store.toggleModelFilter(modelName);
};

const isModelExcluded = (modelName: string) => {
  return store.excludedModels.includes(modelName);
};

// Clipboard copy handling
const isCopying = ref(false);
const copyMarkdown = async () => {
  if (isCopying.value || !store.selectedDetail) return;
  
  const title = store.selectedDetail.title || 'Untitled Session';
  const id = store.selectedDetail.id;
  const start = formatDate(store.selectedDetail.first_seen_at);
  const end = formatDate(store.selectedDetail.last_seen_at);
  
  let markdown = `# Token Audit Report: ${title}\n`;
  markdown += `**Session ID:** \`${id}\`\n`;
  markdown += `**Date:** ${start} to ${end}\n\n`;
  
  markdown += `## Executive Summary\n`;
  markdown += `* **Total Cost:** $${totalCost.value.toFixed(6)}\n`;
  markdown += `* **Estimated Caching Savings:** $${savingsFromCaching.value.toFixed(6)}\n\n`;
  
  markdown += `### Totals by Model\n`;
  markdown += `| Model | Input Tokens | Output Tokens | Cache Read | Reasoning | Cost |\n`;
  markdown += `|---|---|---|---|---|---|\n`;
  
  for (const item of filteredBreakdown.value) {
    markdown += `| ${item.model_name} | ${item.input_tokens.toLocaleString()} | ${item.output_tokens.toLocaleString()} | ${item.cache_read_tokens.toLocaleString()} | ${item.reasoning_tokens.toLocaleString()} | $${item.costs.total_cost.toFixed(6)} |\n`;
  }
  
  markdown += `\n---\n*Generated by Local Token Auditing and Reporting System*`;
  
  try {
    await navigator.clipboard.writeText(markdown);
    isCopying.value = true;
    setTimeout(() => {
      isCopying.value = false;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy text: ', err);
  }
};

const printPdf = () => {
  window.print();
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
        <div v-if="isEditing" class="title-edit-container">
          <input
            ref="titleInput"
            v-model="editTitleVal"
            class="title-edit-input"
            @keydown.enter="saveEdit"
            @keydown.escape="cancelEdit"
            @blur="saveEdit"
            maxlength="200"
          />
        </div>
        <h1
          v-else
          class="editable-title"
          @click="startEdit"
          title="Click to edit conversation title"
        >
          {{ store.selectedDetail.title || 'Untitled Session' }}
          <span class="edit-icon">✏️</span>
        </h1>
        <div class="meta-info">
          <span class="meta-id">ID: <code>{{ store.selectedDetail.id }}</code></span>
          <span class="meta-dot">•</span>
          <span class="meta-time">Active: {{ formatDate(store.selectedDetail.first_seen_at) }} - {{ formatDate(store.selectedDetail.last_seen_at) }}</span>
        </div>
      </div>
      
      <div class="header-actions no-print">
        <!-- Unconfigured cost warning badge -->
        <ModelCostBadge v-if="hasUnconfiguredRates" />
        <div class="export-btn-group">
          <button @click="copyMarkdown" class="export-btn" :class="{ 'copied': isCopying }" :disabled="isCopying">
            <span class="btn-icon">{{ isCopying ? '✓' : '📋' }}</span>
            <span>{{ isCopying ? 'Copied' : 'Copy MD' }}</span>
          </button>
          <button @click="printPdf" class="export-btn print-btn">
            <span class="btn-icon">🖨️</span>
            <span>Print / PDF</span>
          </button>
          <button @click="confirmDelete" class="export-btn delete-btn">
            <span class="btn-icon">🗑️</span>
            <span>Delete</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Model Filter Checkbox Pills -->
    <div class="model-filters-section no-print">
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
    <div class="kpis-section no-print">
      <KpiCards :breakdown="filteredBreakdown" />
    </div>

    <!-- Charts Area -->
    <div class="charts-grid no-print">
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

    <!-- Print Report Section -->
    <div class="print-report print-only">
      <div class="print-header">
        <h1>Local Token Auditing and Reporting System</h1>
        <h2>Conversation Audit Report: {{ store.selectedDetail.title || 'Untitled Session' }}</h2>
        <div class="print-meta-grid">
          <div><strong>Session ID:</strong> <code>{{ store.selectedDetail.id }}</code></div>
          <div><strong>Date Range:</strong> {{ formatDate(store.selectedDetail.first_seen_at) }} - {{ formatDate(store.selectedDetail.last_seen_at) }}</div>
        </div>
      </div>

      <div class="print-summary-cards">
        <div class="print-summary-card">
          <div class="card-label">Total Cost</div>
          <div class="card-value">${{ totalCost.toFixed(6) }}</div>
        </div>
        <div class="print-summary-card">
          <div class="card-label">Est. Caching Savings</div>
          <div class="card-value">${{ savingsFromCaching.toFixed(6) }}</div>
        </div>
        <div class="print-summary-card">
          <div class="card-label">Total Input Tokens</div>
          <div class="card-value">{{ totalInputTokens.toLocaleString() }}</div>
        </div>
        <div class="print-summary-card">
          <div class="card-label">Total Output Tokens</div>
          <div class="card-value">{{ totalOutputTokens.toLocaleString() }}</div>
        </div>
        <div class="print-summary-card">
          <div class="card-label">Cache Read Tokens</div>
          <div class="card-value">{{ totalCacheReadTokens.toLocaleString() }}</div>
        </div>
        <div class="print-summary-card">
          <div class="card-label">Reasoning Tokens</div>
          <div class="card-value">{{ totalReasoningTokens.toLocaleString() }}</div>
        </div>
      </div>

      <h3>Breakdown by Model</h3>
      <table class="print-table">
        <thead>
          <tr>
            <th>Model</th>
            <th>Input Tokens</th>
            <th>Output Tokens</th>
            <th>Cache Read Tokens</th>
            <th>Reasoning Tokens</th>
            <th>Cost ($)</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in filteredBreakdown" :key="item.model_name">
            <td><strong>{{ item.model_name }}</strong></td>
            <td>{{ item.input_tokens.toLocaleString() }}</td>
            <td>{{ item.output_tokens.toLocaleString() }}</td>
            <td>{{ item.cache_read_tokens.toLocaleString() }}</td>
            <td>{{ item.reasoning_tokens.toLocaleString() }}</td>
            <td>${{ item.costs.total_cost.toFixed(6) }}</td>
          </tr>
        </tbody>
      </table>
      
      <div class="print-footer">
        <p>Generated by Antigravity Local Token Auditing and Reporting System</p>
      </div>
    </div>

    <!-- Collapsible Raw Telemetries Section -->
    <div class="telemetries-collapsible-section no-print">
      <div class="collapsible-header" @click="toggleTelemetriesSection">
        <span class="collapsible-arrow">{{ showTelemetriesSection ? '▼' : '▶' }}</span>
        <span class="collapsible-title">📡 Raw Telemetries ({{ conversationTelemetries.length }})</span>
      </div>
      
      <div v-if="showTelemetriesSection" class="collapsible-body">
        <div v-if="loadingTelemetries" class="telemetries-loading">
          Loading raw telemetries...
        </div>
        <div v-else-if="!conversationTelemetries.length" class="telemetries-empty">
          No raw telemetries found for this conversation.
        </div>
        <div v-else class="telemetries-links-grid">
          <router-link 
            v-for="telemetry in conversationTelemetries" 
            :key="telemetry.id"
            :to="`/telemetry?id=${telemetry.id}`"
            class="telemetry-link-card"
          >
            <div class="telemetry-link-header">
              <span class="link-id">Trace #{{ telemetry.id }}</span>
              <span class="link-size">{{ (telemetry.payload_size / 1024).toFixed(1) }} KB</span>
            </div>
            <span class="link-date">{{ formatDate(telemetry.created_at) }}</span>
          </router-link>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div v-if="showDeleteModal" class="modal-overlay no-print">
      <div class="modal-card">
        <h3>Delete Conversation</h3>
        <p>Are you sure you want to delete this conversation? This will also delete all associated atomic spans. Raw telemetries will be kept in the database.</p>
        <div class="modal-actions">
          <button @click="cancelDelete" class="btn-cancel" :disabled="isDeleting">Cancel</button>
          <button @click="handleDelete" class="btn-delete" :disabled="isDeleting">
            {{ isDeleting ? 'Deleting...' : 'Delete' }}
          </button>
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

.editable-title {
  font-size: 24px;
  margin-bottom: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 4px;
  padding: 2px 6px;
  margin-left: -6px; /* offset padding */
  transition: background-color 0.2s;
}

.editable-title:hover {
  background-color: var(--bg-surface-hover);
}

.edit-icon {
  font-size: 14px;
  opacity: 0;
  transition: opacity 0.2s;
}

.editable-title:hover .edit-icon {
  opacity: 0.6;
}

.title-edit-container {
  display: flex;
  align-items: center;
  margin-bottom: 6px;
}

.title-edit-input {
  font-size: 24px;
  font-weight: bold;
  background-color: var(--bg-surface-active);
  border: 1px solid var(--accent);
  color: var(--text-bright);
  border-radius: 4px;
  padding: 2px 6px;
  width: 100%;
  max-width: 500px;
  font-family: inherit;
  outline: none;
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.export-btn-group {
  display: flex;
  gap: 8px;
}

.export-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 6px;
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  color: var(--text);
  cursor: pointer;
  transition: all 0.2s ease;
}

.export-btn:hover:not(:disabled) {
  background-color: var(--bg-surface-hover);
  border-color: var(--text-muted);
  color: var(--text-bright);
}

.export-btn.copied {
  background-color: var(--success-bg);
  border-color: var(--success);
  color: var(--success);
}

.export-btn:disabled {
  cursor: not-allowed;
}

.export-btn.print-btn {
  background-color: var(--accent-bg);
  border-color: var(--accent-border);
  color: var(--accent-light);
}

.export-btn.print-btn:hover {
  background-color: rgba(170, 59, 255, 0.2);
  border-color: var(--accent);
  color: var(--text-bright);
}

.btn-icon {
  font-size: 14px;
}

/* Print Section Styles (screen) */
.print-only {
  display: none !important;
}

/* Print Media Styles */
@media print {
  .print-only {
    display: block !important;
  }

  .print-report {
    background-color: #ffffff;
    color: #000000;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    padding: 20px;
  }

  .print-header {
    border-bottom: 2px solid #333;
    padding-bottom: 12px;
    margin-bottom: 20px;
  }

  .print-header h1 {
    font-size: 18px;
    color: #333;
    margin: 0 0 6px 0;
  }

  .print-header h2 {
    font-size: 14px;
    color: #555;
    margin: 0 0 10px 0;
  }

  .print-meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    font-size: 11px;
    color: #666;
  }

  .print-summary-cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-bottom: 24px;
  }

  .print-summary-card {
    border: 1px solid #ddd;
    padding: 10px;
    border-radius: 6px;
    background-color: #fafafa;
  }

  .card-label {
    font-size: 10px;
    text-transform: uppercase;
    color: #666;
    margin-bottom: 4px;
  }

  .card-value {
    font-size: 14px;
    font-weight: bold;
    color: #111;
  }

  .print-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 10px;
    margin-bottom: 30px;
  }

  .print-table th, .print-table td {
    border: 1px solid #ddd;
    padding: 8px 10px;
    text-align: left;
    font-size: 11px;
    color: #000;
  }

  .print-table th {
    background-color: #f5f5f5;
    font-weight: 600;
    color: #333;
  }

  .print-footer {
    border-top: 1px solid #ddd;
    padding-top: 10px;
    text-align: center;
    font-size: 10px;
    color: #777;
    margin-top: 40px;
  }
}

/* Delete button styling */
.export-btn.delete-btn {
  background-color: var(--danger-bg);
  border-color: rgba(239, 68, 68, 0.4);
  color: var(--danger);
}

.export-btn.delete-btn:hover {
  background-color: rgba(239, 68, 68, 0.2);
  border-color: var(--danger);
  color: var(--text-bright);
}

/* Modal styling */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-card {
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 24px;
  width: 90%;
  max-width: 440px;
  box-shadow: var(--shadow);
  animation: fadeIn 0.2s ease-out;
}

.modal-card h3 {
  margin-top: 0;
  font-size: 18px;
  color: var(--text-bright);
  margin-bottom: 12px;
}

.modal-card p {
  font-size: 14px;
  color: var(--text);
  line-height: 1.5;
  margin-bottom: 24px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-cancel {
  background-color: transparent;
  border: 1px solid var(--border);
  color: var(--text);
}

.btn-cancel:hover:not(:disabled) {
  background-color: var(--bg-surface-hover);
}

.btn-delete {
  background-color: var(--danger);
  border: 1px solid var(--danger);
  color: white;
}

.btn-delete:hover:not(:disabled) {
  background-color: #f87171;
  border-color: #f87171;
}

/* Collapsible Telemetries Section */
.telemetries-collapsible-section {
  border: 1px solid var(--border);
  border-radius: 8px;
  background-color: var(--bg-surface);
  overflow: hidden;
  margin-top: 16px;
}

.collapsible-header {
  padding: 14px 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
  background-color: rgba(0, 0, 0, 0.1);
  transition: background-color 0.2s;
}

.collapsible-header:hover {
  background-color: var(--bg-surface-hover);
}

.collapsible-arrow {
  font-size: 12px;
  color: var(--text-muted);
  width: 14px;
}

.collapsible-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-bright);
}

.collapsible-body {
  padding: 20px;
  border-top: 1px solid var(--border);
  background-color: rgba(0, 0, 0, 0.05);
}

.telemetries-loading, .telemetries-empty {
  text-align: center;
  padding: 16px;
  color: var(--text-muted);
  font-style: italic;
  font-size: 13px;
}

.telemetries-links-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.telemetry-link-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 16px;
  background-color: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  transition: all 0.2s;
}

.telemetry-link-card:hover {
  border-color: var(--accent);
  background-color: var(--bg-surface-hover);
  transform: translateY(-1px);
}

.telemetry-link-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.link-id {
  font-weight: 600;
  color: var(--text-bright);
  font-size: 13px;
}

.link-size {
  font-size: 11px;
  color: var(--text-muted);
  background-color: rgba(255, 255, 255, 0.05);
  padding: 1px 6px;
  border-radius: 4px;
}

.link-date {
  font-size: 11px;
  color: var(--text-muted);
}
</style>
