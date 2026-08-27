/**
 * plan-enforcer.mjs — Verificador de cuotas por plan
 *
 * Intercepta operaciones para verificar que el tenant no exceda
 * los límites de su plan. Se integra con UsageStore y SUBSCRIPTION_PLANS.
 */
import { getPlan, SUBSCRIPTION_PLANS } from "../config/subscriptions.mjs";
import { UsageStore } from "../stores/usage-store.mjs";
import { TenantStore } from "../stores/tenant-store.mjs";

/**
 * Determina el nivel de alerta basado en porcentaje de uso.
 */
function calcAlertLevel(pctUsed, limit) {
  if (limit === Infinity) return "ok";
  if (pctUsed >= 100) return "blocked";
  if (pctUsed >= 90) return "critical";
  if (pctUsed >= 70) return "warning";
  return "ok";
}

/**
 * Obtiene sugerencias de upgrade: planes superiores al actual.
 */
function getUpgradeSuggestions(planId) {
  const currentIdx = SUBSCRIPTION_PLANS.findIndex(p => p.id === planId);
  if (currentIdx < 0) return [];
  return SUBSCRIPTION_PLANS
    .slice(currentIdx + 1)
    .map(p => ({
      id: p.id,
      name: p.name,
      price: p.price,
      interval: p.interval,
      maxReasonings: p.maxReasonings,
    }));
}

/**
 * Verifica si un tenant puede realizar una operación según su plan.
 *
 * @param {string} tenantSlug - Slug del tenant (null para default)
 * @param {string} resource  - "razonamientos" | "contactos" | "deals"
 * @returns {{ allowed: boolean, reason?: string, usage: number, limit: number, plan: string }}
 */
export async function checkQuota(tenantSlug, resource) {
  const tenantStore = TenantStore.getInstance();

  // Resolver tenant
  let tenant = null;
  if (tenantSlug) {
    tenant = await tenantStore.findBySlug(tenantSlug);
  }
  // Si no hay slug o no se encontró, usar plan free (default)
  const planId = tenant?.plan || "free";
  const plan = getPlan(planId);

  // Mapa de recursos a sus límites
  const limitMap = {
    razonamientos: plan.maxReasonings,
    contactos: plan.maxContacts,
    deals: plan.maxDeals,
  };
  const limit = limitMap[resource];
  if (limit === undefined) {
    return { allowed: false, reason: `Recurso '${resource}' no reconocido`, usage: 0, limit: 0, plan: planId };
  }
  if (limit === Infinity) {
    return { allowed: true, usage: 0, limit: Infinity, plan: planId, alertLevel: "ok" };
  }

  // Obtener uso actual
  const usageStore = UsageStore.getInstance(tenantSlug);
  const usage = await usageStore.getUsage();

  const resourceMap = {
    razonamientos: usage.razonamientos_usados,
    contactos: usage.contactos_creados,
    deals: usage.deals_creados,
  };
  const used = resourceMap[resource] || 0;

  const pctUsed = limit > 0 ? Math.round((used / limit) * 100) : 0;
  const alertLevel = calcAlertLevel(pctUsed, limit);
  const upgradeSuggestions = alertLevel === "ok" ? [] : getUpgradeSuggestions(planId);

  if (used >= limit) {
    const upgradeMsg = upgradeSuggestions.length > 0
      ? ` Mejora a ${upgradeSuggestions[0].name} ($${upgradeSuggestions[0].price}/${upgradeSuggestions[0].interval}) en /pricing para seguir usando el servicio.`
      : "";
    return {
      allowed: false,
      reason: `Has alcanzado el límite de ${resource} de tu plan ${plan.name} (${limit}).${upgradeMsg}`,
      usage: used,
      limit,
      plan: planId,
      planName: plan.name,
      pctUsed,
      alertLevel,
      upgradeSuggestions,
    };
  }

  return {
    allowed: true,
    usage: used,
    limit,
    plan: planId,
    planName: plan.name,
    pctUsed,
    alertLevel,
    upgradeSuggestions,
  };
}

/**
 * Verifica cuota y registra alerta de uso si corresponde.
 */
export async function checkQuotaAndAlert(tenantSlug, resource) {
  const result = await checkQuota(tenantSlug, resource);

  if (result.alertLevel === "warning" || result.alertLevel === "critical" || result.alertLevel === "blocked") {
    try {
      const { BillingStore } = await import("../stores/billing-store.mjs");
      const billingStore = BillingStore.getInstance();
      await billingStore.create({
        tenantSlug,
        type: "usage_alert",
        planId: result.plan,
        amount: 0,
        status: "completed",
        metadata: {
          resource,
          pctUsed: result.pctUsed,
          alertLevel: result.alertLevel,
          usage: result.usage,
          limit: result.limit,
        },
      });
    } catch (err) {
      console.error("⚠️ Error registrando usage_alert:", err.message);
    }
  }

  return result;
}

/**
 * Incrementa el contador de uso. Llama después de una operación exitosa.
 */
export async function incrementUsage(tenantSlug, resource, count = 1) {
  const usageStore = UsageStore.getInstance(tenantSlug);
  await usageStore.increment(resource, count);
}

/**
 * Obtiene el resumen completo de uso y límites de un tenant.
 */
export async function getUsageSummary(tenantSlug) {
  const tenantStore = TenantStore.getInstance();
  let tenant = null;
  if (tenantSlug) {
    tenant = await tenantStore.findBySlug(tenantSlug);
  }
  const planId = tenant?.plan || "free";
  const plan = getPlan(planId);

  const usageStore = UsageStore.getInstance(tenantSlug);
  const usage = await usageStore.getUsage();

  return {
    tenant: tenantSlug || "default",
    plan: planId,
    planName: plan.name,
    razonamientos: {
      usado: usage.razonamientos_usados,
      limite: plan.maxReasonings,
    },
    contactos: {
      usado: usage.contactos_creados,
      limite: plan.maxContacts,
    },
    deals: {
      usado: usage.deals_creados,
      limite: plan.maxDeals,
    },
  };
}
