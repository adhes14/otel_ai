<script setup lang="ts">
import { ref, computed } from 'vue';

const props = defineProps<{
  nodeKey?: string | number;
  value: any;
  depth: number;
}>();

const isExpanded = ref(props.depth < 2);
const isCopying = ref(false);

const isObject = computed(() => {
  return props.value !== null && typeof props.value === 'object';
});

const isArray = computed(() => {
  return Array.isArray(props.value);
});

const typeofValue = computed(() => {
  if (props.value === null) return 'null';
  if (Array.isArray(props.value)) return 'array';
  return typeof props.value;
});

const formattedValue = computed(() => {
  if (typeofValue.value === 'string') return `"${props.value}"`;
  return String(props.value);
});

const toggleExpand = () => {
  if (isObject.value) {
    isExpanded.value = !isExpanded.value;
  }
};

const copyNodeValue = async (e: Event) => {
  e.stopPropagation();
  if (isCopying.value) return;
  try {
    const textToCopy = isObject.value 
      ? JSON.stringify(props.value, null, 2)
      : String(props.value);
    await navigator.clipboard.writeText(textToCopy);
    isCopying.value = true;
    setTimeout(() => {
      isCopying.value = false;
    }, 1500);
  } catch (err) {
    console.error('Failed to copy node value:', err);
  }
};
</script>

<template>
  <div class="json-node" :class="{ 'is-expandable': isObject }">
    <div class="node-row" @click="toggleExpand">
      <!-- Chevron for expand/collapse -->
      <span v-if="isObject" class="chevron" :class="{ 'expanded': isExpanded }">
        ▶
      </span>
      <span v-else class="chevron-placeholder"></span>

      <!-- Key -->
      <span v-if="nodeKey !== undefined" class="node-key">
        {{ nodeKey }}:
      </span>

      <!-- Value preview/summary -->
      <span v-if="isObject" class="node-preview">
        <span class="bracket-open">{{ isArray ? '[' : '{' }}</span>
        <span v-if="!isExpanded" class="collapsed-summary">
          {{ isArray ? `${value.length} items` : `${Object.keys(value).length} keys` }}
        </span>
        <span v-if="!isExpanded" class="bracket-close">{{ isArray ? ']' : '}' }}</span>
      </span>
      <span v-else :class="['node-val', `type-${typeofValue}`]">
        {{ formattedValue }}
      </span>

      <!-- Copy Node Button -->
      <button class="copy-node-btn" @click="copyNodeValue" :title="isCopying ? 'Copied!' : 'Copy this section'">
        {{ isCopying ? '✓' : '📋' }}
      </button>
    </div>

    <!-- Recursive children rendering -->
    <div v-if="isObject && isExpanded" class="node-children">
      <template v-if="isArray">
        <JsonTreeNode
          v-for="(item, index) in value"
          :key="index"
          :node-key="index"
          :value="item"
          :depth="depth + 1"
        />
      </template>
      <template v-else>
        <JsonTreeNode
          v-for="(val, key) in value"
          :key="key"
          :node-key="key"
          :value="val"
          :depth="depth + 1"
        />
      </template>
      <span class="bracket-close-block">{{ isArray ? ']' : '}' }}</span>
    </div>
  </div>
</template>

<style scoped>
.json-node {
  font-family: var(--mono, monospace);
  font-size: 13px;
  line-height: 1.6;
  user-select: text;
}

.node-row {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: default;
  position: relative;
  width: 100%;
}

.is-expandable > .node-row {
  cursor: pointer;
}

.node-row:hover {
  background-color: var(--bg-surface-hover);
}

.chevron {
  display: inline-block;
  font-size: 9px;
  color: var(--text-muted);
  width: 14px;
  transition: transform 0.2s ease;
  user-select: none;
}

.chevron.expanded {
  transform: rotate(90deg);
}

.chevron-placeholder {
  display: inline-block;
  width: 14px;
}

.node-key {
  color: #c084fc; /* var(--accent-light) equivalent */
  font-weight: 500;
  margin-right: 6px;
}

.node-val {
  word-break: break-all;
}

.type-string {
  color: #10b981; /* var(--success) equivalent */
}

.type-number {
  color: #3b82f6; /* var(--info) equivalent */
}

.type-boolean {
  color: #f59e0b; /* var(--warning) equivalent */
}

.type-null {
  color: var(--text-muted);
}

.bracket-open, .bracket-close, .bracket-close-block {
  color: var(--text-muted);
}

.bracket-close-block {
  display: block;
  padding-left: 14px;
  margin-top: 2px;
}

.collapsed-summary {
  font-size: 11px;
  color: var(--text-muted);
  background-color: rgba(255, 255, 255, 0.05);
  padding: 1px 4px;
  border-radius: 3px;
  margin: 0 4px;
  font-style: italic;
}

.node-children {
  padding-left: 20px;
  border-left: 1px dashed var(--border);
  margin-left: 6px;
}

.copy-node-btn {
  opacity: 0;
  border: none;
  background: transparent;
  padding: 2px;
  font-size: 11px;
  margin-left: 8px;
  cursor: pointer;
  color: var(--text-muted);
  transition: opacity 0.15s ease, color 0.15s ease;
}

.node-row:hover .copy-node-btn {
  opacity: 1;
}

.copy-node-btn:hover {
  color: var(--text-bright);
}
</style>
