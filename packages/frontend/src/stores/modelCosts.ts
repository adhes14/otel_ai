import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/client.js';
import type { ModelCost } from '../api/client.js';

export const useModelCostsStore = defineStore('modelCosts', () => {
  const modelCosts = ref<ModelCost[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const fetchModelCosts = async () => {
    loading.value = true;
    error.value = null;
    try {
      modelCosts.value = await api.getModelCosts();
    } catch (err: any) {
      error.value = err.message || 'Failed to fetch model costs';
    } finally {
      loading.value = false;
    }
  };

  const createModelCost = async (cost: Omit<ModelCost, 'created_at'>) => {
    loading.value = true;
    error.value = null;
    try {
      await api.createModelCost(cost);
      await fetchModelCosts();
    } catch (err: any) {
      error.value = err.message || 'Failed to create model cost';
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const updateModelCost = async (modelName: string, cost: Omit<ModelCost, 'model_name' | 'created_at'>) => {
    loading.value = true;
    error.value = null;
    try {
      await api.updateModelCost(modelName, cost);
      await fetchModelCosts();
    } catch (err: any) {
      error.value = err.message || 'Failed to update model cost';
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const deleteModelCost = async (modelName: string) => {
    loading.value = true;
    error.value = null;
    try {
      await api.deleteModelCost(modelName);
      await fetchModelCosts();
    } catch (err: any) {
      error.value = err.message || 'Failed to delete model cost';
      throw err;
    } finally {
      loading.value = false;
    }
  };

  return {
    modelCosts,
    loading,
    error,
    fetchModelCosts,
    createModelCost,
    updateModelCost,
    deleteModelCost,
  };
});
