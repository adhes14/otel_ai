<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useModelCostsStore } from '../stores/modelCosts.js';
import type { ModelCost } from '../api/client.js';

const store = useModelCostsStore();

// Inline edit state
const editingModelName = ref<string | null>(null);
const editForm = ref<Omit<ModelCost, 'model_name'>>({
  input_cost_per_m: 0,
  output_cost_per_m: 0,
  cache_cost_per_m: 0,
  reasoning_cost_per_m: 0
});

// Add new model state
const showAddForm = ref(false);
const newModelForm = ref<ModelCost>({
  model_name: '',
  input_cost_per_m: 0,
  output_cost_per_m: 0,
  cache_cost_per_m: 0,
  reasoning_cost_per_m: 0
});
const addError = ref<string | null>(null);

onMounted(() => {
  store.fetchModelCosts();
});

const startEdit = (cost: ModelCost) => {
  editingModelName.value = cost.model_name;
  editForm.value = {
    input_cost_per_m: cost.input_cost_per_m,
    output_cost_per_m: cost.output_cost_per_m,
    cache_cost_per_m: cost.cache_cost_per_m,
    reasoning_cost_per_m: cost.reasoning_cost_per_m
  };
};

const cancelEdit = () => {
  editingModelName.value = null;
};

const saveEdit = async (modelName: string) => {
  try {
    await store.updateModelCost(modelName, editForm.value);
    editingModelName.value = null;
  } catch (err) {
    // Error handled by store
  }
};

const handleDelete = async (modelName: string) => {
  if (confirm(`Are you sure you want to delete rate limits for "${modelName}"?`)) {
    try {
      await store.deleteModelCost(modelName);
    } catch (err) {
      // Error handled by store
    }
  }
};

const submitAdd = async () => {
  addError.value = null;
  if (!newModelForm.value.model_name.trim()) {
    addError.value = 'Model name is required';
    return;
  }
  try {
    await store.createModelCost(newModelForm.value);
    newModelForm.value = {
      model_name: '',
      input_cost_per_m: 0,
      output_cost_per_m: 0,
      cache_cost_per_m: 0,
      reasoning_cost_per_m: 0
    };
    showAddForm.value = false;
  } catch (err: any) {
    addError.value = err.message || 'Failed to add model cost';
  }
};
</script>

<template>
  <div class="settings-container fade-in">
    <div class="settings-header">
      <div class="header-main">
        <router-link to="/" class="back-link">← Back to Dashboard</router-link>
        <h1>Model Costs Configuration</h1>
        <p class="subtitle">Set and update cost rates per million tokens. These rates determine the estimated session costs shown on your dashboard.</p>
      </div>
      <button class="primary" @click="showAddForm = !showAddForm">
        {{ showAddForm ? 'Cancel' : '+ Add Custom Model' }}
      </button>
    </div>

    <div v-if="store.error" class="alert alert-error">
      <span>⚠️ {{ store.error }}</span>
    </div>

    <!-- Add Model Modal/Form -->
    <div v-if="showAddForm" class="add-form-card">
      <h3>Add New Model Cost Rate</h3>
      <form @submit.prevent="submitAdd" class="add-form">
        <div class="form-group">
          <label>Model Name (OTel identifier, e.g., 'gpt-4o')</label>
          <input v-model="newModelForm.model_name" placeholder="e.g. gpt-4o-mini" required />
        </div>
        <div class="grid-4">
          <div class="form-group">
            <label>Input Cost / M</label>
            <input type="number" step="0.0001" min="0" v-model.number="newModelForm.input_cost_per_m" required />
          </div>
          <div class="form-group">
            <label>Output Cost / M</label>
            <input type="number" step="0.0001" min="0" v-model.number="newModelForm.output_cost_per_m" required />
          </div>
          <div class="form-group">
            <label>Cache Cost / M</label>
            <input type="number" step="0.0001" min="0" v-model.number="newModelForm.cache_cost_per_m" required />
          </div>
          <div class="form-group">
            <label>Reasoning Cost / M</label>
            <input type="number" step="0.0001" min="0" v-model.number="newModelForm.reasoning_cost_per_m" required />
          </div>
        </div>
        <div v-if="addError" class="form-error">{{ addError }}</div>
        <div class="form-actions">
          <button type="button" @click="showAddForm = false">Cancel</button>
          <button type="submit" class="primary">Add Model</button>
        </div>
      </form>
    </div>

    <!-- Model Costs Table -->
    <div class="table-card">
      <div v-if="store.loading && !store.modelCosts.length" class="loading-state">
        Loading model rates...
      </div>
      <table v-else class="costs-table">
        <thead>
          <tr>
            <th>Model Name</th>
            <th>Input Cost /M</th>
            <th>Output Cost /M</th>
            <th>Cache Cost /M</th>
            <th>Reasoning Cost /M</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="cost in store.modelCosts" :key="cost.model_name" :class="{ 'editing-row': editingModelName === cost.model_name }">
            <td class="model-name-cell">
              <code>{{ cost.model_name }}</code>
            </td>
            
            <!-- Input cost -->
            <td>
              <input v-if="editingModelName === cost.model_name" type="number" step="0.0001" min="0" v-model.number="editForm.input_cost_per_m" class="table-input" />
              <span v-else>${{ cost.input_cost_per_m.toFixed(2) }}</span>
            </td>

            <!-- Output cost -->
            <td>
              <input v-if="editingModelName === cost.model_name" type="number" step="0.0001" min="0" v-model.number="editForm.output_cost_per_m" class="table-input" />
              <span v-else>${{ cost.output_cost_per_m.toFixed(2) }}</span>
            </td>

            <!-- Cache cost -->
            <td>
              <input v-if="editingModelName === cost.model_name" type="number" step="0.0001" min="0" v-model.number="editForm.cache_cost_per_m" class="table-input" />
              <span v-else>${{ cost.cache_cost_per_m.toFixed(2) }}</span>
            </td>

            <!-- Reasoning cost -->
            <td>
              <input v-if="editingModelName === cost.model_name" type="number" step="0.0001" min="0" v-model.number="editForm.reasoning_cost_per_m" class="table-input" />
              <span v-else>${{ cost.reasoning_cost_per_m.toFixed(2) }}</span>
            </td>

            <!-- Status -->
            <td>
              <span v-if="cost.input_cost_per_m === 0 && cost.output_cost_per_m === 0" class="badge badge-warning">
                ⚠️ Cost not configured
              </span>
              <span v-else class="badge badge-success">
                Active
              </span>
            </td>

            <!-- Actions -->
            <td>
              <div v-if="editingModelName === cost.model_name" class="action-buttons">
                <button class="btn-save" @click="saveEdit(cost.model_name)">Save</button>
                <button class="btn-cancel" @click="cancelEdit">Cancel</button>
              </div>
              <div v-else class="action-buttons">
                <button class="btn-edit" @click="startEdit(cost)">Edit</button>
                <button class="btn-delete" @click="handleDelete(cost.model_name)">Delete</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.settings-container {
  padding: 40px 24px;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 32px;
}

.back-link {
  display: inline-block;
  margin-bottom: 12px;
  font-size: 14px;
}

.settings-header h1 {
  font-size: 32px;
  margin-bottom: 8px;
}

.subtitle {
  color: var(--text-muted);
  max-width: 700px;
  margin: 0;
  line-height: 1.5;
}

.alert {
  padding: 12px 16px;
  border-radius: 6px;
  margin-bottom: 24px;
  font-weight: 500;
}

.alert-error {
  background-color: var(--danger-bg);
  border: 1px solid rgba(239, 68, 68, 0.2);
  color: var(--danger);
}

.add-form-card {
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 24px;
  margin-bottom: 32px;
}

.add-form-card h3 {
  margin-bottom: 16px;
  font-size: 18px;
}

.add-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 13px;
  color: var(--text-muted);
  font-weight: 500;
}

.grid-4 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.form-error {
  color: var(--danger);
  font-size: 14px;
  font-weight: 500;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 8px;
}

.table-card {
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.loading-state {
  padding: 48px;
  text-align: center;
  color: var(--text-muted);
}

.costs-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.costs-table th, .costs-table td {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.costs-table th {
  background-color: rgba(0, 0, 0, 0.1);
  font-weight: 600;
  color: var(--text-bright);
}

.model-name-cell code {
  font-size: 14px;
  background-color: var(--bg);
  padding: 4px 8px;
}

.table-input {
  width: 100px;
  padding: 4px 8px;
}

.editing-row {
  background-color: rgba(170, 59, 255, 0.03);
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.action-buttons button {
  padding: 6px 12px;
  font-size: 13px;
}

.btn-save {
  background-color: var(--success);
  border-color: var(--success);
  color: white;
}

.btn-save:hover {
  background-color: #059669;
  border-color: #059669;
}

.btn-cancel {
  border-color: var(--border);
}

.btn-edit {
  border-color: var(--accent-border);
  color: var(--accent-light);
}

.btn-edit:hover {
  background-color: var(--accent-bg);
}

.btn-delete {
  border-color: rgba(239, 68, 68, 0.3);
  color: #ef4444;
}

.btn-delete:hover {
  background-color: rgba(239, 68, 68, 0.1);
}

@media (max-width: 768px) {
  .grid-4 {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
