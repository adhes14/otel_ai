import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { api } from '../api/client.js';
import type { RawTelemetrySummary, RawTelemetryDetail } from '../api/client.js';

export const useRawTelemetryStore = defineStore('rawTelemetry', () => {
  const telemetries = ref<RawTelemetrySummary[]>([]);
  const nextCursor = ref<string | null>(null);
  const selectedId = ref<number | null>(null);
  const selectedTelemetry = ref<RawTelemetryDetail | null>(null);

  const searchQuery = ref('');
  const loadingList = ref(false);
  const loadingDetail = ref(false);
  const error = ref<string | null>(null);

  let searchTimeout: any = null;
  watch(searchQuery, () => {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      fetchTelemetries(true);
    }, 300);
  });

  const fetchTelemetries = async (reset = false) => {
    if (reset) {
      telemetries.value = [];
      nextCursor.value = null;
    }
    loadingList.value = true;
    error.value = null;
    try {
      const cursor = reset ? null : nextCursor.value;
      const response = await api.getRawTelemetries(20, cursor, searchQuery.value);
      if (reset) {
        telemetries.value = response.telemetries;
      } else {
        const existingIds = new Set(telemetries.value.map(t => t.id));
        const newItems = response.telemetries.filter(t => !existingIds.has(t.id));
        telemetries.value.push(...newItems);
      }
      nextCursor.value = response.next_cursor;
    } catch (err: any) {
      error.value = err.message || 'Failed to fetch telemetries';
    } finally {
      loadingList.value = false;
    }
  };

  const fetchNextPage = async () => {
    if (loadingList.value || !nextCursor.value) return;
    await fetchTelemetries(false);
  };

  const selectTelemetry = async (id: number) => {
    selectedId.value = id;
    loadingDetail.value = true;
    error.value = null;
    try {
      const detail = await api.getRawTelemetry(id);
      selectedTelemetry.value = detail;
    } catch (err: any) {
      error.value = err.message || 'Failed to load telemetry details';
      selectedTelemetry.value = null;
    } finally {
      loadingDetail.value = false;
    }
  };

  const deleteTelemetry = async (id: number) => {
    error.value = null;
    try {
      await api.deleteRawTelemetry(id);
      telemetries.value = telemetries.value.filter(t => t.id !== id);
      if (selectedId.value === id) {
        selectedId.value = null;
        selectedTelemetry.value = null;
      }
    } catch (err: any) {
      error.value = err.message || 'Failed to delete telemetry';
      throw err;
    }
  };

  return {
    telemetries,
    nextCursor,
    selectedId,
    selectedTelemetry,
    searchQuery,
    loadingList,
    loadingDetail,
    error,
    fetchTelemetries,
    fetchNextPage,
    selectTelemetry,
    deleteTelemetry,
  };
});
