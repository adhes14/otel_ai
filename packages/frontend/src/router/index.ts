import { createRouter, createWebHistory } from 'vue-router';
import DashboardView from '../views/DashboardView.vue';
import ModelCostsView from '../views/ModelCostsView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: DashboardView,
    },
    {
      path: '/settings/model-costs',
      name: 'model-costs',
      component: ModelCostsView,
    },
  ],
});

export default router;
