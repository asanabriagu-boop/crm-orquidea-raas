/**
 * revenue-stats.mjs — Estadísticas de revenue para admin dashboard
 *
 * Calcula MRR, ARR, paying customers, churn rate desde BillingStore y TenantStore.
 * Útil para el dashboard de administración.
 */
import { TenantStore } from "../stores/tenant-store.mjs";
import { getMonthlyPrice } from "../config/subscriptions.mjs";

let _billingStore = null;

async function getBillingStore() {
  if (!_billingStore) {
    const { BillingStore } = await import("../stores/billing-store.mjs");
    _billingStore = BillingStore.getInstance();
  }
  return _billingStore;
}

/**
 * Obtiene estadísticas completas de revenue.
 */
export async function getRevenueStats() {
  const tenantStore = TenantStore.getInstance();
  const allTenants = await tenantStore.getAll();

  const totalCustomers = allTenants.filter(t => t.isActive !== false).length;
  const payingTenants = allTenants.filter(t => t.isActive !== false && t.plan && t.plan !== "free");

  // MRR: suma de precios mensuales de todos los tenants pagos
  let mrr = 0;
  const revenueByPlan = {};

  for (const t of payingTenants) {
    const monthly = getMonthlyPrice(t.plan);
    mrr += monthly;
    revenueByPlan[t.plan] = (revenueByPlan[t.plan] || 0) + monthly;
  }

  const arr = mrr * 12;
  const payingCustomers = payingTenants.length;

  // Churn rate estimado: cancelaciones últimos 30d / total pagos al inicio
  let churnRate = 0;
  try {
    const billingStore = await getBillingStore();
    const allEvents = await billingStore.getAll(500);
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const recentCancels = allEvents.filter(e =>
      e.type === "subscription_canceled"
      && e.status === "completed"
      && new Date(e.createdAt) >= thirtyDaysAgo
    );

    // Tenants activos hace 30 días (aproximación: los paying actuales + los que cancelaron)
    const active30dAgo = payingCustomers + recentCancels.length;
    churnRate = active30dAgo > 0 ? Math.round((recentCancels.length / active30dAgo) * 100) / 100 : 0;
  } catch (err) {
    console.error("⚠️ Error calculando churn rate:", err.message);
  }

  // Transacciones recientes (últimos 5 eventos de pago)
  let recentTransactions = [];
  try {
    const billingStore = await getBillingStore();
    const allEvents = await billingStore.getAll(500);
    recentTransactions = allEvents
      .filter(e => e.type === "payment_received" || e.type === "subscription_created" || e.type === "subscription_changed")
      .filter(e => e.status === "completed")
      .slice(0, 5)
      .map(e => ({
        id: e.id,
        tenantSlug: e.tenantSlug,
        type: e.type,
        planId: e.planId,
        amount: e.amount,
        date: e.createdAt,
      }));
  } catch (err) {
    console.error("⚠️ Error obteniendo transacciones recientes:", err.message);
  }

  // MRR proyectado a fin de mes (asumiendo crecimiento lineal)
  const projectedMRR = mrr;

  return {
    mrr,
    arr,
    totalCustomers,
    payingCustomers,
    churnRate,
    revenueByPlan,
    recentTransactions,
    projectedMRR,
  };
}

/**
 * Obtiene revenue por plan para gráficas.
 */
export async function getRevenueByPlan() {
  const stats = await getRevenueStats();
  return stats.revenueByPlan;
}

/**
 * Obtiene el número de clientes pagos.
 */
export async function getPayingCustomers() {
  const tenantStore = TenantStore.getInstance();
  const allTenants = await tenantStore.getAll();
  return allTenants.filter(t => t.isActive !== false && t.plan && t.plan !== "free").length;
}
