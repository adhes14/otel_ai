<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '../api/client.js';

interface DbStat {
  size_bytes: number;
  size_mb: number;
}

const dbStat = ref<DbStat>({ size_bytes: 0, size_mb: 0 });
const loading = ref(false);
const error = ref<string | null>(null);

const purgeDays = ref(30);
const showConfirmModal = ref(false);
const purging = ref(false);
const successMessage = ref<string | null>(null);

const reprocessing = ref(false);
const showReprocessConfirmModal = ref(false);

const handleReprocess = async () => {
  reprocessing.value = true;
  successMessage.value = null;
  error.value = null;
  try {
    const response = await api.reprocessTelemetry();
    successMessage.value = response.message || 'Successfully regenerated conversations and spans.';
    showReprocessConfirmModal.value = false;
    await fetchDbStat();
  } catch (err: any) {
    error.value = err.message || 'Failed to regenerate conversations';
  } finally {
    reprocessing.value = false;
  }
};

const fetchDbStat = async () => {
  loading.value = true;
  error.value = null;
  try {
    const data = await api.getDbStat();
    dbStat.value = data;
  } catch (err: any) {
    error.value = err.message || 'Failed to fetch database size statistics';
  } finally {
    loading.value = false;
  }
};

const handlePurge = async () => {
  purging.value = true;
  successMessage.value = null;
  error.value = null;
  try {
    const response = await api.purgeRawTelemetry(purgeDays.value);
    dbStat.value = {
      size_bytes: response.size_bytes,
      size_mb: response.size_mb
    };
    successMessage.value = `Successfully purged ${response.deleted_count} old raw telemetry record(s).`;
    showConfirmModal.value = false;
  } catch (err: any) {
    error.value = err.message || 'Failed to purge telemetry records';
  } finally {
    purging.value = false;
  }
};

onMounted(() => {
  fetchDbStat();
});
</script>

<template>
  <div class="settings-container fade-in">
    <!-- Header -->
    <div class="settings-header">
      <h1>⚙️ System Settings & Maintenance</h1>
      <p class="subtitle">Monitor database usage and perform manual data lifecycle maintenance actions.</p>
    </div>

    <!-- Alert Messages -->
    <div v-if="error" class="alert-message danger">
      <span class="alert-icon">⚠️</span>
      <span class="alert-text">{{ error }}</span>
      <button class="alert-close" @click="error = null">×</button>
    </div>

    <div v-if="successMessage" class="alert-message success">
      <span class="alert-icon">✓</span>
      <span class="alert-text">{{ successMessage }}</span>
      <button class="alert-close" @click="successMessage = null">×</button>
    </div>

    <div class="settings-grid">
      <!-- Database Info Card -->
      <div class="settings-card">
        <div class="card-header">
          <h3>🗄️ Database Statistics</h3>
          <button class="refresh-btn" @click="fetchDbStat" :disabled="loading">
            {{ loading ? 'Refreshing...' : '🔄 Refresh' }}
          </button>
        </div>
        
        <div class="stat-group">
          <div class="stat-item">
            <span class="stat-label">Database File Size</span>
            <span class="stat-value">{{ dbStat.size_mb }} MB</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Size in Bytes</span>
            <span class="stat-value">{{ dbStat.size_bytes.toLocaleString() }} bytes</span>
          </div>
        </div>
        
        <div class="card-footer-info">
          <p>The SQLite database stores both the raw OTLP payload trace records and the processed analytics. In WAL mode, a checkpoint and VACUUM operation is executed automatically after a purge to release unused disk space.</p>
        </div>
      </div>

      <!-- Maintenance / Purge Card -->
      <div class="settings-card warning-card">
        <div class="card-header">
          <h3>🧹 Telemetry Retention Cleanup</h3>
        </div>

        <div class="purge-form">
          <div class="form-group">
            <label for="purge-days">Purge raw telemetry records older than:</label>
            <div class="input-with-label">
              <input 
                id="purge-days" 
                type="number" 
                v-model.number="purgeDays" 
                min="0" 
                placeholder="30"
              />
              <span class="input-suffix">days</span>
            </div>
          </div>
          
          <button class="purge-btn" @click="showConfirmModal = true">
            🗑️ Purge Raw History
          </button>
        </div>

        <div class="card-footer-info">
          <p><strong>Note:</strong> Purging only removes records from the <code>raw_telemetry</code> table (which stores incoming full-payload trace JSONs). Your processed aggregates in <code>conversations</code> and <code>atomic_spans</code> will remain intact.</p>
        </div>
      </div>

      <!-- Regenerate Conversations Card -->
      <div class="settings-card warning-card">
        <div class="card-header">
          <h3>🔄 Regenerate Conversations</h3>
        </div>

        <div class="purge-form">
          <p class="reprocess-warning-text">
            Re-extract conversation metadata and atomic spans for all historical raw OTel traces.
          </p>
          <button class="reprocess-btn" @click="showReprocessConfirmModal = true" :disabled="reprocessing">
            🔄 Regenerate Database
          </button>
        </div>

        <div class="card-footer-info">
          <p><strong>Note:</strong> This process will clear all derived <code>conversations</code> and <code>atomic_spans</code>, then replay the parsing of all stored <code>raw_telemetry</code> records. Configured model costs will not be affected.</p>
        </div>
      </div>
    </div>

    <!-- Confirmation Modal Dialog -->
    <div v-if="showConfirmModal" class="modal-overlay">
      <div class="modal-content danger-modal fade-in">
        <div class="modal-header">
          <h2>⚠️ Confirm Destructive Action</h2>
        </div>
        <div class="modal-body">
          <p>You are about to delete raw telemetry records older than <strong>{{ purgeDays }} days</strong>.</p>
          <div class="warning-box">
            <p><strong>Warning:</strong> This operation is permanent and cannot be undone. SQLite will execute a <code>VACUUM</code> after deletion, which may take a few seconds.</p>
          </div>
        </div>
        <div class="modal-actions">
          <button class="cancel-btn" @click="showConfirmModal = false" :disabled="purging">
            Cancel
          </button>
          <button class="confirm-btn" @click="handlePurge" :disabled="purging">
            {{ purging ? 'Purging & Vacuuming...' : 'Yes, Delete Permanently' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Reprocess Confirmation Modal -->
    <div v-if="showReprocessConfirmModal" class="modal-overlay">
      <div class="modal-content danger-modal fade-in">
        <div class="modal-header">
          <h2>⚠️ Confirm Database Rebuild</h2>
        </div>
        <div class="modal-body">
          <p>Are you sure you want to clear and rebuild all conversation metadata?</p>
          <div class="warning-box">
            <p><strong>Warning:</strong> This will temporarily clear your dashboards while it parses all existing raw telemetry records. Depending on the size of your database, this may take a few seconds.</p>
          </div>
        </div>
        <div class="modal-actions">
          <button class="cancel-btn" @click="showReprocessConfirmModal = false" :disabled="reprocessing">
            Cancel
          </button>
          <button class="confirm-btn" @click="handleReprocess" :disabled="reprocessing">
            {{ reprocessing ? 'Rebuilding...' : 'Yes, Rebuild Now' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-container {
  padding: 24px;
  max-width: 1000px;
  margin: 0 auto;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.settings-header h1 {
  font-size: 28px;
  margin-bottom: 8px;
}

.subtitle {
  color: var(--text-muted);
  font-size: 15px;
  margin: 0;
}

/* Alert Messages */
.alert-message {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-radius: 8px;
  position: relative;
  animation: fadeIn 0.2s ease-out;
}

.alert-message.danger {
  background-color: var(--danger-bg);
  border: 1px solid var(--danger);
  color: var(--text-bright);
}

.alert-message.success {
  background-color: var(--success-bg);
  border: 1px solid var(--success);
  color: var(--success);
}

.alert-icon {
  font-size: 20px;
}

.alert-text {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
}

.alert-close {
  background: transparent;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: inherit;
  padding: 0;
  line-height: 1;
}

/* Settings Grid Layout */
.settings-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

@media (max-width: 768px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }
}

.settings-card {
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.settings-card.warning-card {
  border-color: rgba(239, 68, 68, 0.2);
  background: linear-gradient(180deg, var(--bg-surface) 0%, rgba(239, 68, 68, 0.02) 100%);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header h3 {
  font-size: 18px;
  margin: 0;
}

.refresh-btn {
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
}

/* Stats */
.stat-group {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  background-color: var(--bg);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-label {
  color: var(--text-muted);
  font-size: 14px;
}

.stat-value {
  font-weight: 600;
  font-size: 16px;
  color: var(--text-bright);
}

.card-footer-info {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
}

.card-footer-info p {
  margin: 0;
}

/* Form Styles */
.purge-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  background-color: var(--bg);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-size: 14px;
  color: var(--text);
  font-weight: 500;
}

.input-with-label {
  display: flex;
  align-items: center;
  gap: 10px;
}

.input-with-label input {
  width: 100px;
  padding: 8px 12px;
  text-align: center;
}

.input-suffix {
  font-size: 14px;
  color: var(--text-muted);
}

.purge-btn {
  background-color: var(--danger-bg);
  border: 1px solid var(--danger);
  color: var(--text-bright);
  font-weight: 600;
  padding: 10px 16px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
}

.purge-btn:hover {
  background-color: var(--danger);
}

/* Modal dialog Overlay */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.modal-content {
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  width: 100%;
  max-width: 500px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  box-shadow: var(--shadow);
}

.danger-modal {
  border-color: var(--danger);
}

.modal-header h2 {
  margin: 0;
  font-size: 20px;
  color: var(--text-bright);
}

.modal-body {
  font-size: 14px;
  color: var(--text);
  line-height: 1.5;
}

.warning-box {
  background-color: var(--danger-bg);
  border-left: 4px solid var(--danger);
  padding: 12px 16px;
  border-radius: 4px;
  margin-top: 12px;
}

.warning-box p {
  margin: 0;
  color: var(--text-bright);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.cancel-btn {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text);
}

.cancel-btn:hover {
  background: var(--bg-surface-hover);
}

.confirm-btn {
  background-color: var(--danger);
  border: 1px solid var(--danger);
  color: white;
  font-weight: 600;
}

.confirm-btn:hover {
  background-color: #dc2626;
  border-color: #dc2626;
}

.reprocess-warning-text {
  font-size: 14px;
  color: var(--text);
  margin: 0 0 8px 0;
  line-height: 1.4;
}

.reprocess-btn {
  background-color: var(--bg-surface-hover);
  border: 1px solid var(--border);
  color: var(--text-bright);
  font-weight: 600;
  padding: 10px 16px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
}

.reprocess-btn:hover:not(:disabled) {
  background-color: var(--border);
  border-color: var(--text-muted);
}

.reprocess-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
