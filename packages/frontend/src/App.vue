<template>
  <div class="app-container">
    <header class="app-header">
      <div class="header-logo">
        <span class="logo-emoji">🕵️‍♂️</span>
        <span class="logo-text">OTel AI Token Auditor</span>
      </div>
      <nav class="app-nav">
        <router-link to="/" class="nav-link" active-class="active">Dashboard</router-link>
        <router-link to="/telemetry" class="nav-link" active-class="active">📡 Telemetry</router-link>
        <router-link to="/settings/model-costs" class="nav-link" active-class="active">💰 Model Costs</router-link>
        <router-link to="/settings" class="nav-link" active-class="active">⚙️ Settings</router-link>
      </nav>
    </header>
    <main class="app-content">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background-color: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(8px);
}

.header-logo {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-emoji {
  font-size: 24px;
}

.logo-text {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-bright);
  letter-spacing: -0.5px;
}

.app-nav {
  display: flex;
  gap: 8px;
}

.nav-link {
  color: var(--text-muted);
  font-weight: 500;
  padding: 8px 16px;
  border-radius: 6px;
  transition: all 0.2s ease;
}

.nav-link:hover {
  color: var(--text-bright);
  background-color: var(--bg-surface-hover);
}

.nav-link.active {
  color: var(--accent-light);
  background-color: var(--accent-bg);
}

.app-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
}
</style>
