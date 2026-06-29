<template>
  <div class="warning-badge-card fade-in">
    <span class="warning-icon">⚠️</span>
    <div class="warning-body">
      <span class="warning-title">Rates Not Configured</span>
      <p class="warning-desc">Some models in this conversation are charged at $0.00 rate.</p>
    </div>
    <router-link to="/settings/model-costs" class="configure-link">
      Configure Rates
    </router-link>
  </div>
</template>

<style scoped>
.warning-badge-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background-color: var(--warning-bg);
  border: 1px solid rgba(245, 158, 11, 0.2);
  padding: 10px 16px;
  border-radius: 8px;
  max-width: 420px;
}

.warning-icon {
  font-size: 20px;
}

.warning-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.warning-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--warning);
}

.warning-desc {
  font-size: 11px;
  color: var(--text-muted);
  margin: 0;
}

.configure-link {
  font-size: 12px;
  font-weight: 600;
  color: var(--warning);
  text-decoration: underline;
  white-space: nowrap;
}

.configure-link:hover {
  color: var(--text-bright);
}
</style>
