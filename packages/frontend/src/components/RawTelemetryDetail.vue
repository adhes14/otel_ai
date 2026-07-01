<script setup lang="ts">
import { ref } from 'vue';
import { useRawTelemetryStore } from '../stores/rawTelemetry.js';
import JsonTreeNode from './JsonTreeNode.vue';

const store = useRawTelemetryStore();
const isCopying = ref(false);

const formatDate = (timestamp: number) => {
  return new Date(timestamp * 1000).toLocaleString();
};

const copyFullPayload = async () => {
  if (isCopying.value || !store.selectedTelemetry) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(store.selectedTelemetry.payload, null, 2));
    isCopying.value = true;
    setTimeout(() => {
      isCopying.value = false;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy payload:', err);
  }
};

const showDeleteModal = ref(false);
const isDeleting = ref(false);

const confirmDelete = () => {
  showDeleteModal.value = true;
};

const cancelDelete = () => {
  showDeleteModal.value = false;
};

const handleDelete = async () => {
  if (!store.selectedTelemetry) return;
  isDeleting.value = true;
  try {
    await store.deleteTelemetry(store.selectedTelemetry.id);
    showDeleteModal.value = false;
  } catch (err) {
    console.error('Failed to delete telemetry:', err);
  } finally {
    isDeleting.value = false;
  }
};
</script>

<template>
  <div v-if="store.loadingDetail" class="detail-loading-state">
    <div class="loader">Loading telemetry details...</div>
  </div>

  <div v-else-if="store.selectedTelemetry" class="detail-container fade-in">
    <!-- Header -->
    <div class="detail-header">
      <div class="title-section">
        <h1>Telemetry Trace #{{ store.selectedTelemetry.id }}</h1>
        <div class="meta-info">
          <span class="meta-item">
            <strong>Conversation ID:</strong>
            <code v-if="store.selectedTelemetry.conversation_id">{{ store.selectedTelemetry.conversation_id }}</code>
            <span v-else class="text-muted italic">None (No associated conversation)</span>
          </span>
          <span class="meta-dot">•</span>
          <span class="meta-item">
            <strong>Received:</strong> {{ formatDate(store.selectedTelemetry.created_at) }}
          </span>
        </div>
      </div>

      <div class="header-actions">
        <button @click="copyFullPayload" class="export-btn" :class="{ 'copied': isCopying }" :disabled="isCopying">
          <span class="btn-icon">{{ isCopying ? '✓' : '📋' }}</span>
          <span>{{ isCopying ? 'Copied Full JSON' : 'Copy Full JSON' }}</span>
        </button>
        <button @click="confirmDelete" class="export-btn delete-btn">
          <span class="btn-icon">🗑️</span>
          <span>Delete</span>
        </button>
      </div>
    </div>

    <!-- Tree View container -->
    <div class="json-viewer-card">
      <div class="viewer-header">
        <span class="viewer-title">Interactive JSON tree</span>
      </div>
      <div class="viewer-content">
        <JsonTreeNode :value="store.selectedTelemetry.payload" :depth="0" />
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div v-if="showDeleteModal" class="modal-overlay no-print">
      <div class="modal-card">
        <h3>Delete Telemetry</h3>
        <p>Are you sure you want to delete this raw telemetry record? This action is permanent and cannot be undone.</p>
        <div class="modal-actions">
          <button @click="cancelDelete" class="btn-cancel" :disabled="isDeleting">Cancel</button>
          <button @click="handleDelete" class="btn-delete" :disabled="isDeleting">
            {{ isDeleting ? 'Deleting...' : 'Delete' }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <div v-else class="no-selection-state">
    <div class="no-selection-message">
      <span class="no-selection-icon">📡</span>
      <h2>No telemetry trace selected</h2>
      <p>Select a telemetry trace from the list to explore its raw payload.</p>
    </div>
  </div>
</template>

<style scoped>
.detail-loading-state, .no-selection-state {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--text-muted);
  height: 100%;
}

.loader {
  animation: pulse 1.5s infinite;
  font-size: 18px;
}

.no-selection-message {
  text-align: center;
  max-width: 400px;
  padding: 32px;
}

.no-selection-icon {
  font-size: 48px;
  display: block;
  margin-bottom: 16px;
}

.no-selection-message h2 {
  font-size: 20px;
  margin-bottom: 8px;
  color: var(--text-bright);
}

.no-selection-message p {
  font-size: 14px;
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

.meta-item code {
  font-size: 11px;
  padding: 2px 4px;
  background-color: var(--bg-surface-active);
  border-radius: 4px;
  color: var(--text-bright);
}

.italic {
  font-style: italic;
}

.meta-dot {
  color: var(--border);
}

.json-viewer-card {
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 400px;
  overflow: hidden;
}

.viewer-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background-color: rgba(0, 0, 0, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.viewer-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.viewer-content {
  padding: 20px;
  overflow: auto;
  flex: 1;
  background-color: rgba(0, 0, 0, 0.2);
}

.header-actions {
  display: flex;
  align-items: center;
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

.btn-icon {
  font-size: 14px;
}

@keyframes pulse {
  0% { opacity: 0.5; }
  50% { opacity: 1; }
  100% { opacity: 0.5; }
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
  background: transparent;
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

@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
</style>
