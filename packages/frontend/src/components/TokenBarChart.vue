<script setup lang="ts">
import { computed } from 'vue';
import { Bar } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js';
import type { AtomicSpan } from '../api/client.js';

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

const props = defineProps<{
  spans: AtomicSpan[];
}>();

// Slice the spans to show the most recent 50 spans to prevent overcrowding
const visibleSpans = computed(() => {
  if (props.spans.length <= 50) return props.spans;
  return props.spans.slice(-50);
});

const isSliced = computed(() => props.spans.length > 50);

const chartData = computed(() => {
  const spans = visibleSpans.value;
  const labels = spans.map((_, idx) => {
    // If it's sliced, adjust the numbering offset
    const indexOffset = isSliced.value ? props.spans.length - 50 : 0;
    return `Span #${indexOffset + idx + 1}`;
  });

  return {
    labels,
    datasets: [
      {
        label: 'Input Tokens',
        backgroundColor: '#10b981', // green
        data: spans.map(s => s.input_tokens),
      },
      {
        label: 'Output Tokens',
        backgroundColor: '#3b82f6', // blue
        data: spans.map(s => s.output_tokens),
      },
      {
        label: 'Cache Read',
        backgroundColor: '#f59e0b', // yellow
        data: spans.map(s => s.cache_read_tokens),
      },
      {
        label: 'Cache Write',
        backgroundColor: '#a855f7', // purple
        data: spans.map(s => s.cache_write_tokens),
      },
      {
        label: 'Reasoning',
        backgroundColor: '#f97316', // orange
        data: spans.map(s => s.reasoning_tokens),
      },
    ],
  };
});

const chartOptions = computed(() => {
  return {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        stacked: true,
        grid: {
          color: '#232535', // --border color
        },
        ticks: {
          color: '#7e8299', // --text-muted
          font: {
            family: 'Inter',
            size: 10,
          },
        },
      },
      y: {
        stacked: true,
        grid: {
          color: '#232535', // --border color
        },
        ticks: {
          color: '#7e8299', // --text-muted
          font: {
            family: 'Inter',
            size: 10,
          },
        },
      },
    },
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: '#c5c6cd', // --text
          font: {
            family: 'Inter',
            size: 11,
          },
          boxWidth: 12,
          padding: 12,
        },
      },
      tooltip: {
        callbacks: {
          title: (tooltipItems: any) => {
            const index = tooltipItems[0].dataIndex;
            const span = visibleSpans.value[index];
            return `Model: ${span.model_name}`;
          },
        },
      },
    },
  };
});
</script>

<template>
  <div class="bar-container">
    <div v-if="!props.spans.length" class="no-data-msg">
      No span data available for this conversation.
    </div>
    <div v-else class="chart-box">
      <div v-if="isSliced" class="sliced-warning">
        ⚠️ Only showing the last 50 of {{ props.spans.length }} spans
      </div>
      <div class="canvas-wrapper">
        <Bar :data="chartData" :options="chartOptions" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.bar-container {
  width: 100%;
  height: 100%;
  min-height: 250px;
  display: flex;
  flex-direction: column;
}

.chart-box {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.sliced-warning {
  font-size: 11px;
  color: var(--warning);
  background-color: var(--warning-bg);
  padding: 4px 10px;
  border-radius: 4px;
  margin-bottom: 8px;
  align-self: center;
}

.canvas-wrapper {
  flex: 1;
  position: relative;
  min-height: 220px;
}

.no-data-msg {
  color: var(--text-muted);
  font-size: 13px;
  text-align: center;
  padding: 24px;
  margin: auto;
}
</style>
