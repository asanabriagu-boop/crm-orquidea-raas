/**
 * tenants.mjs — Configuración de Tenants
 *
 * Define los tenants pre-configurados y sus datos iniciales.
 * seed-demo.mjs usa esto para poblar la base de datos.
 */
export const TENANT_SEEDS = [
  {
    slug: "mototractor",
    name: "Mototractor CRM",
    plan: "enterprise",
    branding: {
      primaryColor: "#2d5016",
      companyName: "Mototractor",
      tagline: "Soporte Técnico - Servicio al Cliente - Pre ventas - Ventas",
    },
  },
  {
    slug: "ideagro",
    name: "Ideagro",
    plan: "professional",
    branding: {
      primaryColor: "#1565c0",
      companyName: "Ideagro",
      tagline: "Agricultura inteligente · Soporte técnico especializado",
    },
  },
  {
    slug: "motostabily",
    name: "MotoStabily",
    plan: "professional",
    branding: {
      primaryColor: "#2d5016",
      companyName: "MotoStabily",
      tagline: "Proyección financiera y análisis de costos",
    },
  },
];
