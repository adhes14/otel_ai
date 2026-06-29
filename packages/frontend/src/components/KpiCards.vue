<script setup lang="ts">
import { computed } from 'vue';
import type { ModelCostBreakdown } from '../api/client.js';

const props = defineProps<{
  breakdown: ModelCostBreakdown[];
}>();

// Formatter helper
const formatNumber = (num: number) => {
  return new Intl.NumberFormat().format(num);
};

const formatCurrency = (num: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }).format(num);
};

const totals = computed(() => {
  let input = 0;
  let output = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let reasoning = 0;

  let inputCost = 0;
  let outputCost = 0;
  let cacheCost = 0;
  let reasoningCost = 0;
  let costWithoutCache = 0;

  for (const item of props.breakdown) {
    input += item.input_tokens;
    output += item.output_tokens;
    cacheRead += item.cache_read_tokens;
    cacheWrite += item.cache_write_tokens;
    reasoning += item.reasoning_tokens;

    inputCost += item.costs.input_cost;
    outputCost += item.costs.output_cost;
    cacheCost += item.costs.cache_read_cost + item.costs.cache_write_cost;
    reasoningCost += item.costs.reasoning_cost;

    // Standard input rate per million
    const normalRate = Number(item.rates.input_cost_per_m || 0);
    // Treat cache read and cache write tokens as standard input tokens
    const cacheTokensCostWithoutCache = ((item.cache_read_tokens + item.cache_write_tokens) * normalRate) / 1_000_000;
    
    const itemCostWithoutCache = 
      item.costs.input_cost + 
      cacheTokensCostWithoutCache + 
      item.costs.output_cost + 
      item.costs.reasoning_cost;
      
    costWithoutCache += itemCostWithoutCache;
  }

  const totalCost = inputCost + outputCost + cacheCost + reasoningCost;
  const savingsPct = costWithoutCache > 0 ? ((costWithoutCache - totalCost) / costWithoutCache) * 100 : 0;

  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    reasoning,
    inputCost,
    outputCost,
    cacheCost,
    reasoningCost,
    totalCost,
    costWithoutCache,
    savingsPct: Math.max(0, savingsPct)
  };
});
</script>

<template>
  <div class="kpis-grid">
    <!-- Input Card -->
    <div class="kpi-card card-input">
      <div class="kpi-icon">🟩</div>
      <div class="kpi-data">
        <span class="kpi-title">Input Tokens</span>
        <span class="kpi-value">{{ formatNumber(totals.input) }}</span>
        <span class="kpi-cost">Cost: {{ formatCurrency(totals.inputCost) }}</span>
      </div>
    </div>

    <!-- Output Card -->
    <div class="kpi-card card-output">
      <div class="kpi-icon">🟦</div>
      <div class="kpi-data">
        <span class="kpi-title">Output Tokens</span>
        <span class="kpi-value">{{ formatNumber(totals.output) }}</span>
        <span class="kpi-cost">Cost: {{ formatCurrency(totals.outputCost) }}</span>
      </div>
    </div>

    <!-- Cache Card -->
    <div class="kpi-card card-cache">
      <div class="kpi-icon">🟨</div>
      <div class="kpi-data">
        <span class="kpi-title">Cache (Read/Write)</span>
        <span class="kpi-value">
          {{ formatNumber(totals.cacheRead) }} <span class="sub-val">/ {{ formatNumber(totals.cacheWrite) }}</span>
        </span>
        <span class="kpi-cost">Cost: {{ formatCurrency(totals.cacheCost) }}</span>
      </div>
    </div>

    <!-- Reasoning Card -->
    <div class="kpi-card card-reasoning">
      <div class="kpi-icon">🟧</div>
      <div class="kpi-data">
        <span class="kpi-title">Reasoning Tokens</span>
        <span class="kpi-value">{{ formatNumber(totals.reasoning) }}</span>
        <span class="kpi-cost">Cost: {{ formatCurrency(totals.reasoningCost) }}</span>
      </div>
    </div>

    <!-- Total Cost Summary Card -->
    <div class="kpi-card card-total-cost">
      <div class="kpi-icon">💵</div>
      <div class="kpi-data">
        <span class="kpi-title">Total Cost</span>
        <span class="kpi-value cost-highlight">{{ formatCurrency(totals.totalCost) }}</span>
        <span class="kpi-cost">Accumulated cost for active models</span>
      </div>
    </div>

    <!-- Cache Savings Card -->
    <div class="kpi-card card-savings">
      <div class="kpi-icon">⚡</div>
      <div class="kpi-data">
        <span class="kpi-title">Cache Savings</span>
        <span class="kpi-value savings-highlight">{{ totals.savingsPct.toFixed(1) }}%</span>
        <span class="kpi-cost" :title="'No Cache: ' + formatCurrency(totals.costWithoutCache)">
          No Cache: {{ formatCurrency(totals.costWithoutCache) }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kpis-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 16px;
  width: 100%;
}

.kpi-card {
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  box-shadow: var(--shadow);
  transition: transform 0.2s, border-color 0.2s;
  min-width: 0;
}

.kpi-card:hover {
  transform: translateY(-2px);
}

.card-input:hover { border-color: var(--success); }
.card-output:hover { border-color: var(--info); }
.card-cache:hover { border-color: var(--warning); }
.card-reasoning:hover { border-color: var(--orange); }
.card-total-cost:hover { border-color: var(--accent); }
.card-savings:hover { border-color: var(--success); }

.kpi-icon {
  font-size: 24px;
  line-height: 1;
}

.kpi-data {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.kpi-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.5px;
}

.kpi-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-bright);
  line-height: 1.2;
}

.sub-val {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
}

.kpi-cost {
  font-size: 12px;
  color: var(--text-muted);
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

.cost-highlight {
  color: var(--accent-light);
}

.savings-highlight {
  color: var(--success);
}

@media (max-width: 1200px) {
  .kpis-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 768px) {
  .kpis-grid {
    grid-template-columns: 1fr;
  }
}
</style>
