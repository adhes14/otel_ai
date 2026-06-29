<script setup lang="ts">
import { computed } from 'vue';
import { Doughnut } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import type { ModelCostBreakdown } from '../api/client.js';

ChartJS.register(Title, Tooltip, ArcElement, Legend);

const props = defineProps<{
  breakdown: ModelCostBreakdown[];
}>();

// Palette matching our dark theme
const colorsPalette = [
  '#aa3bff', // primary accent
  '#3b82f6', // blue info
  '#10b981', // green success
  '#f97316', // orange warning
  '#ec4899', // pink
  '#f59e0b', // yellow
  '#06b6d4', // cyan
];

const hasData = computed(() => {
  return props.breakdown.length > 0 && props.breakdown.some(item => item.costs.total_cost > 0);
});

const chartData = computed(() => {
  const labels = props.breakdown.map(item => item.model_name);
  const data = props.breakdown.map(item => item.costs.total_cost);

  return {
    labels,
    datasets: [
      {
        data,
        backgroundColor: colorsPalette.slice(0, props.breakdown.length),
        borderColor: '#151620', // match bg-surface
        borderWidth: 2,
        hoverOffset: 4,
      },
    ],
  };
});

const chartOptions = computed(() => {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: '#c5c6cd', // --text color
          font: {
            family: 'Inter',
            size: 12,
          },
          padding: 16,
        },
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const val = context.raw || 0;
            return ` $${val.toFixed(6)}`;
          },
        },
      },
    },
    cutout: '65%',
  };
});
</script>

<template>
  <div class="donut-container">
    <div v-if="!hasData" class="no-data-msg">
      No costs computed yet. Make sure to configure rates for active models.
    </div>
    <Doughnut v-else :data="chartData" :options="chartOptions" />
  </div>
</template>

<style scoped>
.donut-container {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 250px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.no-data-msg {
  color: var(--text-muted);
  font-size: 13px;
  text-align: center;
  padding: 24px;
}
</style>
