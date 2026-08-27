/**
 * subscriptions.mjs — Planes de Suscripción CRM (SaaS)
 *
 * Inspirado en AchieveApex con modelo RaaS (Reasoning as a Service).
 * Límites de recursos por plan y precios competitivos para LATAM.
 *
 * Narrativa: "El primer CRM construido sobre RaaS"
 */
export const SUBSCRIPTION_PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    interval: "month",
    maxContacts: 10,
    maxDeals: 5,
    maxProducts: 3,
    maxReasonings: 100,  // Razonamientos/mes = invocaciones al agente
    maxChannels: 1,
    allowedChannels: ["webchat"],
    features: [
      "1 tenant",
      "Web Chat",
      "CRM básico (contactos, deals, conversaciones)",
      "100 razonamientos de IA / mes",
      "Soporte por email",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    price: 29,
    interval: "month",
    maxContacts: 100,
    maxDeals: 50,
    maxProducts: 20,
    maxReasonings: 1000,
    maxChannels: 2,
    allowedChannels: ["webchat", "whatsapp"],
    features: [
      "1 tenant",
      "Web Chat + WhatsApp",
      "Catálogo de productos",
      "Links de pago",
      "1,000 razonamientos de IA / mes",
      "RAG básico (base de conocimiento)",
      "Soporte por email prioritario",
    ],
  },
  {
    id: "professional",
    name: "Professional",
    price: 79,
    interval: "month",
    maxContacts: 500,
    maxDeals: 200,
    maxProducts: 100,
    maxReasonings: 5000,
    maxChannels: 3,
    allowedChannels: ["webchat", "whatsapp", "instagram"],
    features: [
      "Hasta 3 tenants",
      "Todos los canales (Web Chat, WhatsApp, Instagram)",
      "Analíticas avanzadas",
      "5,000 razonamientos de IA / mes",
      "Base de conocimiento RAG completa",
      "Soporte prioritario",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 1500,
    interval: "year",
    maxContacts: Infinity,
    maxDeals: Infinity,
    maxProducts: Infinity,
    maxReasonings: Infinity,
    maxChannels: Infinity,
    allowedChannels: ["webchat", "whatsapp", "instagram"],
    features: [
      "Tenants ilimitados",
      "Todos los canales",
      "Razonamientos de IA ilimitados",
      "On-premise / Docker disponible",
      "White-label (marca propia)",
      "API y CLI completos",
      "Integraciones personalizadas",
      "Soporte dedicado 24/7",
      "SLA garantizado",
    ],
  },
];

/**
 * Obtiene un plan por su ID.
 */
export function getPlan(planId) {
  return SUBSCRIPTION_PLANS.find(p => p.id === planId) || SUBSCRIPTION_PLANS[0];
}

/**
 * Calcula el precio mensual equivalente (para Enterprise que es anual).
 */
export function getMonthlyPrice(planId) {
  const plan = getPlan(planId);
  if (!plan) return 0;
  if (plan.interval === "year") return Math.round(plan.price / 12);
  return plan.price;
}
