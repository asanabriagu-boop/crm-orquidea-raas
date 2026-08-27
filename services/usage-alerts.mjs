/**
 * usage-alerts.mjs — Alertas proactivas de uso para tenants
 *
 * Genera alertas estructuradas basadas en el consumo actual vs límites del plan.
 * Se integra con el dashboard del tenant para mostrar banners y notificaciones.
 */
import { getUsageSummary } from "./plan-enforcer.mjs";

/**
 * Obtiene alertas de uso para un tenant.
 * @param {string} tenantSlug
 * @returns {Promise<{ alerts: Array, hasAlerts: boolean, highestLevel: string }>}
 */
export async function getUsageAlerts(tenantSlug) {
  const summary = await getUsageSummary(tenantSlug);
  const alerts = [];

  const resources = [
    { key: "razonamientos", label: "Razonamientos de IA" },
    { key: "contactos", label: "Contactos" },
    { key: "deals", label: "Deals" },
  ];

  for (const r of resources) {
    const data = summary[r];
    if (!data || data.limite === Infinity) continue;

    const pctUsed = data.limite > 0 ? Math.round((data.usado / data.limite) * 100) : 0;

    let level = "ok";
    let message = "";

    if (pctUsed >= 100) {
      level = "blocked";
      message = `Has alcanzado el límite de ${r.label} (${data.usado}/${data.limite}).`;
    } else if (pctUsed >= 90) {
      level = "critical";
      message = `Te queda menos del 10% de ${r.label} (${data.usado}/${data.limite}).`;
    } else if (pctUsed >= 70) {
      level = "warning";
      message = `Has usado el ${pctUsed}% de ${r.label} (${data.usado}/${data.limite}).`;
    }

    if (level !== "ok") {
      alerts.push({
        resource: r.key,
        label: r.label,
        usado: data.usado,
        limite: data.limite,
        pctUsed,
        level,
        message,
      });
    }
  }

  const levels = { blocked: 4, critical: 3, warning: 2, ok: 1 };
  const highestLevel = alerts.length > 0
    ? alerts.sort((a, b) => levels[b.level] - levels[a.level])[0].level
    : "ok";

  return {
    alerts,
    hasAlerts: alerts.length > 0,
    highestLevel,
    planName: summary.planName,
    plan: summary.plan,
  };
}

/**
 * Verifica si se debe mostrar una advertencia para un recurso específico.
 * @param {string} tenantSlug
 * @param {string} resource - "razonamientos" | "contactos" | "deals"
 * @returns {Promise<boolean>}
 */
export async function shouldWarn(tenantSlug, resource) {
  const summary = await getUsageSummary(tenantSlug);
  const data = summary[resource];
  if (!data || data.limite === Infinity) return false;

  return data.limite > 0 && (data.usado / data.limite) >= 0.7;
}

/**
 * Obtiene el mensaje de alerta para un recurso específico.
 */
export async function getAlertMessage(tenantSlug, resource) {
  const summary = await getUsageSummary(tenantSlug);
  const data = summary[resource];
  if (!data || data.limite === Infinity) return null;

  const pctUsed = data.limite > 0 ? Math.round((data.usado / data.limite) * 100) : 0;

  if (pctUsed >= 100) {
    return `⚠️ Has alcanzado el límite de ${resource} de tu plan ${summary.planName}. Mejora tu plan en /pricing.`;
  }
  if (pctUsed >= 90) {
    return `⚠️ Te queda menos del 10% de ${resource} (${data.usado}/${data.limite}). Considera mejorar tu plan.`;
  }
  if (pctUsed >= 70) {
    return `📊 Has usado el ${pctUsed}% de ${resource} (${data.usado}/${data.limite}).`;
  }
  return null;
}
