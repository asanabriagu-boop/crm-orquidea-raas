/**
 * mototractor-knowledge.mjs — Base de Conocimiento del Mototractor
 *
 * Contiene toda la información técnica, de patente, mercado y pruebas
 * del Mototractor para que el CRM Agent la use en sus respuestas.
 *
 * 80GB de documentación del /mototractor resumida en este knowledge base.
 */

export const MOTOTRACTOR_KNOWLEDGE = {

  // ═══════════════════════════════════════════════
  // INFORMACIÓN GENERAL
  // ═══════════════════════════════════════════════

  general: {
    name: "Mototractor",
    tagline: "Soporte Técnico - Servicio al Cliente - Pre ventas - Ventas",
    description: "Sistema innovador que convierte motocicletas o motores estacionarios en vehículos agrícolas multifuncionales, sin modificar permanentemente la fuente de potencia original. Producto colombiano producido por Ideagro.",
    productor: "Ideagro — empresa colombiana a cargo de la producción y comercialización",
    direccion: "Grupo Industrial Ideagro S.A.S. — Calle 20 # 13-23, Barrio Capellanía, Cajicá, Colombia",
    desarrolladores: ["Wilson David Medina Rubiano", "Cristhian Giovanny Perdigon Zorrilla", "Sergio Camilo Pinzón Corredor", "Sebastián Peña Ortiz"],
    universidad: "Universidad Nacional de Colombia",
    estado: "Listo para comercialización — Pruebas de campo realizadas",
    // 🔗 Link para ver el producto en acción (fotos, videos, demo, redes).
    // MotoStabily comparte la marca social/la landing del Mototractor.
    ver_producto_url: "https://beacons.ai/mototractor_oficial",
  },

  // ═══════════════════════════════════════════════
  // ESPECIFICACIONES TÉCNICAS
  // ═══════════════════════════════════════════════

  especificaciones: {
    componentes_principales: [
      "Mecanismo de acoplamiento universal — Se adapta a diferentes chasis mediante mordazas ajustables",
      "Sistema de transmisión con multiplicación de torque — Cadena de rodillos con piñones (14, 15, 16 dientes) que duplica el torque",
      "Eje principal telescópico — Permite ajustar la trocha para diferentes condiciones de terreno y cultivos",
      "Sistema de bloqueo de rueda libre — Ejes estriados concéntricos para liberar/bloquear ruedas individualmente",
      "Toma de fuerza (TDF) homologado — Eje estriado para 150 rpm para operar máquinas estacionarias",
      "Mecanismo de tiro categoría cero — Para enganchar implementos agrícolas normalizados",
    ],
    torque_maximo: "Doble multiplicación de torque respecto a la fuente de potencia original",
    rpm_tdf: "150 RPM (toma de fuerza estandarizada, según ficha técnica)",
    pendiente_maxima: "35° (supera el límite de 20° de tractores convencionales)",
    peso_estimado: "Liviano — diseñado para ser transportado y ensamblado por una persona",
    adaptabilidad: "Compatible con motocicletas 125cc-250cc y motores estacionarios",
  },

  // ═══════════════════════════════════════════════
  // CARACTERÍSTICAS INNOVADORAS
  // ═══════════════════════════════════════════════

  innovacion: {
    reversibilidad_total: "El vehículo fuente mantiene el 100% de su función original — se puede desconectar",
    doble_multiplicacion: "Aumenta la fuerza disponible para trabajos agrícolas significativamente",
    tdf_independiente: "La toma de fuerza funciona sin que giren las ruedas, permitiendo operar maquinaria estacionaria",
    adaptabilidad_universal: "Compatible con múltiples fuentes de potencia (motos y motores estacionarios)",
    geometria_ajustable: "Trocha ajustable para diferentes condiciones de terreno y cultivos",
    sin_diferencial: "Usa ejes estriados concéntricos en lugar de engranajes cónicos — más simple, más barato, más mantenible",
    solucion_ladera: "Diseñado específicamente para terrenos de ladera (hasta 35° de pendiente)",
  },

  // ═══════════════════════════════════════════════
  // DATOS DE PRUEBAS (Test de Nebraska / Fuerzas)
  // ═══════════════════════════════════════════════

  pruebas: {
    resumen: "Se realizaron pruebas de fuerza y RPM en 5 marchas usando el archivo 'SENSORES Y TACOMETRO modificados.xlsx'. Los datos se recolectaron con sensores y tacómetro en condiciones de campo.",
    fuerzas_maximas: {
      primera: { fuerza_kg: 330.50, rpm: 4068.72, newtons: 3241.10, puntos: 746 },
      segunda: { fuerza_kg: 424.13, rpm: 9167.82, newtons: 4159.29, puntos: 348 },
      tercera: { fuerza_kg: "N/A", rpm: "N/A", newtons: "N/A", puntos: 200 },
      cuarta: { fuerza_kg: 1964.13, rpm: 9385.17, newtons: 19261.54, puntos: 271 },
    },
    prueba_campo: {
      ubicacion: "San Carlos de Guaroa, Meta, Colombia",
      fecha: "2024-2025",
      descripcion: "Pruebas de campo en terreno agrícola real — incluye video, fotos y datos de sensores",
      archivos: "Prueba San Carlos de Guaroa/ — contiene videos, fotos y archivo SRT con transcripción",
    },
    datos_tecnicos: "79GB de datos disponibles en /mototractor/ incluyendo fichas técnicas, planos, patentes, tesis, presentaciones y análisis estadísticos",
  },

  // ═══════════════════════════════════════════════
  // APLICACIONES Y USOS
  // ═══════════════════════════════════════════════

  aplicaciones: {
    preparacion_suelos: "Arado y rastra en terrenos de ladera (hasta 35°)",
    transporte: "Carretas y remolques agrícolas — mantiene función de transporte original",
    maquinas_estacionarias: [
      "Molinos de granos",
      "Bombas de agua",
      "Generadores eléctricos",
      "Bandas transportadoras",
      "Ordeñadoras portátiles",
    ],
    multifuncionalidad: "3 en 1: transporte + tracción agrícola + potencia estacionaria",
  },

  // ═══════════════════════════════════════════════
  // VENTAJAS COMPETITIVAS
  // ═══════════════════════════════════════════════

  ventajas: {
    costo: "80-90% más económico que tractores convencionales",
    precio_objetivo: "30-50% del costo de un tractor pequeño",
    precio_kit_completo: "Kit completo (Mototractor + Moto NKD 125cc 0km): $15.000.000 COP",
    precio_mototractor_solo: "Solo Mototractor (sin moto): $9.800.000 COP",
    versatilidad: "Mantiene función de transporte original del vehículo",
    disponibilidad: "Usa motocicletas producidas localmente — repuestos estándar",
    mantenimiento: "Partes estándar de motocicletas, fácil reposición en cualquier taller",
    terreno: "Funciona en terrenos de ladera (hasta 35° vs 20° de tractores convencionales)",
    inversion: "El usuario ya posee la motocicleta — solo adquiere el kit convertidor",
  },

  // ═══════════════════════════════════════════════
  // CONTACTOS
  // ═══════════════════════════════════════════════

  contactos: {
    angela_cuadrado: {
      nombre: "Ángela Cuadrado",
      telefono: "350 4515126",
      rol: "Ventas y producción — contacto directo para cotizaciones y producción",
    },
    servicio_crm: {
      telefono: "3106743561",
      descripcion: "Contacto para el servicio de automatización CRM",
    },
  },

  // ═══════════════════════════════════════════════
  // PATENTE
  // ═══════════════════════════════════════════════

  patente: {
    titulo: "Convertidor de Potencia para Vehículos Agrícolas (también referido como 'Mototractor', 'AgroCP' o 'Flexi Terreno')",
    numero_expediente: "NC2021/0002926",
    fecha_radicacion: "4 de marzo de 2021",
    solicitantes: ["Wilson David Medina Rubiano", "Cristhian Giovanny Perdigon Zorrilla", "Sergio Camilo Pinzón Corredor", "Sebastián Peña Ortiz"],
    tipo: "Patente de Modelo de Utilidad",
    publicacion_gaceta: "Gaceta de la Propiedad Industrial No. 955, del 8 de marzo de 2022",
    reivindicaciones: [
      "Chasis Principal que soporta todos los componentes",
      "Mecanismo de Acoplamiento adaptable a diferentes fuentes de potencia",
      "Eje Intermedio para transición y multiplicación del torque",
      "Eje Principal telescópico soportado en rodamientos de pedestal",
      "Sistema de Bloqueo de Rueda Libre (ejes estriados concéntricos)",
      "Toma de Fuerza estandarizado (150 rpm)",
      "Frenos de Discos hidráulicos",
      "Sistema de Transmisión de Potencia y Multiplicación del Torque",
    ],
    estado_tramite: "Radicada el 4 de marzo de 2021 ante la Superintendencia de Industria y Comercio de Colombia (SIC) bajo el expediente NC2021/0002926. El 9 de junio de 2022 se emitió resolución de abandono (Resolución 240 PT Resolución Abandono art 44) por no haberse solicitado el examen de patentabilidad en el plazo requerido. Se requiere verificar estado actual para determinar si hay reposición o nueva solicitud.",
    abandono: {
      fecha: "9 de junio de 2022",
      resolucion: "240 PT Resolución Abandono art 44",
      motivo: "No se solicitó examen de patentabilidad dentro del plazo de 3 meses según Artículo 44 de la Decisión 486 de la Comunidad Andina",
    },
    nueva_version_2024: "Se encontraron documentos de nueva versión preparados entre julio y diciembre de 2024 (Descripción Técnica, Reivindicaciones, Estado del Arte, Resumen, Anexos) que podrían corresponder a una nueva solicitud de patente.",
    ubicacion_docs: "/mototractor/Mototractor Project/PATENTE/",
  },

  // ═══════════════════════════════════════════════
  // MERCADO
  // ═══════════════════════════════════════════════

  mercado: {
    segmentos: [
      "Pequeños agricultores (1-5 hectáreas, agricultura familiar)",
      "Agricultores de ladera (zonas andinas con pendientes pronunciadas)",
      "Cooperativas agrícolas (compartir maquinaria entre miembros)",
      "Proyectos de desarrollo rural (programas gubernamentales y ONGs)",
    ],
    paises_potenciales: ["Colombia", "Perú", "Ecuador", "Bolivia", "Centroamérica", "África Oriental", "Sureste Asiático"],
    mercado_colombia: "3.5 millones de hectáreas en ladera en Colombia",
    competencia: {
      azadon: "32.6 días por hectárea — físicamente exigente",
      yunta_bueyes: "5 días por hectárea — limitada velocidad",
      motocultor_5kw: "13 horas por hectárea — máximo 20° pendiente",
      tractor_categoria2: "1.5 horas por hectárea — alto costo, poco acceso",
      mototractor_estimado: "2-4 horas por hectárea (estimado) — adaptable a 35° pendiente",
    },
    potencial_usuarios: "500,000+ en región andina",
  },

  // ═══════════════════════════════════════════════
  // TESIS Y DOCUMENTACIÓN ACADÉMICA
  // ═══════════════════════════════════════════════

  documentacion: {
    tesis: [
      "TESIS CRISTHIAN PERDIGON — Investigación sobre diseño del Mototractor",
      "TESIS SEBASTIAN PEÑA — Investigación sobre componentes y ensamble",
      "TESIS SERGIO PINZON — Investigación sobre validación técnica",
      "TESIS WILSON MEDINA — Investigación sobre pruebas de rendimiento",
    ],
    congresos: [
      "CONGRESO 2019 MÉXICO — Artículos presentados por Wilson Medina, Cristhian Perdigon, Sebastian Peña",
      "CONGRESO XII 2024 — Aplicación móvil para comercialización y soporte técnico del Mototractor",
      "CONGRESO XII 2024 — Banco de pruebas para Mototractor y Motocultor",
    ],
    fallas_identificadas: "Documento 'Fallas Identificadas en el Prototipo 2023 del MT' disponible en INVESTIGACION/FALLAS IDENTIFICADAS/",
    plan_desarrollo: "Cronograma de desarrollo del Mototractor disponible en INVESTIGACION/PLAN DE DESARROLLO/",
    plan_negocios: "Plan de Negocios MotoTractor disponible en INVESTIGACION/Plan_de_Negocios_MotoTractor.docx",
    propuesta_valor: "Documento de Propuesta de valor disponible en INVESTIGACION/Propuesta de valor.docx",
  },

  // ═══════════════════════════════════════════════
  // PREGUNTAS FRECUENTES (para respuestas rápidas)
  // ═══════════════════════════════════════════════

  faq: [
    {
      pregunta: "¿Qué es el Mototractor?",
      respuesta: "El Mototractor es un Convertidor de Potencia para Vehículos Agrícolas. Es un sistema innovador que transforma motocicletas o motores estacionarios en un tractor agrícola multifuncional, sin modificar permanentemente el vehículo original. Un producto colombiano producido por Ideagro.",
    },
    {
      pregunta: "¿Cuánto cuesta?",
      respuesta: "El Mototractor solo (sin moto) cuesta $9.800.000 COP. El kit completo (Mototractor + Moto NKD 125cc 0km) cuesta $15.000.000 COP. Es 80-90% más barato que un tractor convencional.",
    },
    {
      pregunta: "¿Qué pendiente puede subir?",
      respuesta: "El Mototractor puede trabajar en terrenos de hasta 35° de pendiente, mientras que los tractores convencionales están limitados a 20°. Esto lo hace ideal para agricultura de ladera.",
    },
    {
      pregunta: "¿Qué puedo hacer con un Mototractor?",
      respuesta: "Tres funciones principales: 1) Preparación de suelos (arado, rastra), 2) Transporte de materiales con carretas y remolques, 3) Operación de máquinas estacionarias como molinos, bombas de agua, generadores eléctricos, etc.",
    },
    {
      pregunta: "¿Es fácil de mantener?",
      respuesta: "Sí, usa partes estándar de motocicletas que se consiguen en cualquier taller. El mantenimiento es simple y cualquier mecánico de motos puede repararlo.",
    },
    {
      pregunta: "¿Tiene patente?",
      respuesta: "Sí, la patente 'Convertidor de Potencia para Vehículos Agrícolas' fue radicada el 4 de marzo de 2021 ante la Superintendencia de Industria y Comercio de Colombia bajo el expediente NC2021/0002926, con 8 reivindicaciones principales. Los solicitantes son Wilson David Medina Rubiano, Cristhian Giovanny Perdigon Zorrilla, Sergio Camilo Pinzón Corredor y Sebastián Peña Ortiz. Se está preparando una nueva versión de la solicitud.",
    },
    {
      pregunta: "¿Qué fuerza tiene?",
      respuesta: "En pruebas de campo se registraron fuerzas de hasta 1,964 kg en 4ta marcha. En primera marcha: 330 kg, segunda: 424 kg. Datos validados estadísticamente con sensores y tacómetro.",
    },
  ],
};

/**
 * Genera un prompt de contexto sobre el Mototractor para incluir en las consultas al agente.
 */
export function getMototractorContext(question = "") {
  const base = [
    "=== CONTEXTO DEL PRODUCTO: MOTOTRACTOR ===",
    "",
    `Nombre: ${MOTOTRACTOR_KNOWLEDGE.general.name}`,
    `Descripción: ${MOTOTRACTOR_KNOWLEDGE.general.description}`,
    `Desarrolladores: ${MOTOTRACTOR_KNOWLEDGE.general.desarrolladores.join(", ")} — ${MOTOTRACTOR_KNOWLEDGE.general.universidad}`,
    `Dirección oficina: ${MOTOTRACTOR_KNOWLEDGE.general.direccion}`,
    "",
    "--- COMPONENTES ---",
    ...MOTOTRACTOR_KNOWLEDGE.especificaciones.componentes_principales,
    "",
    "--- VENTAJAS ---",
    ...Object.entries(MOTOTRACTOR_KNOWLEDGE.ventajas).map(([k, v]) => `• ${k}: ${v}`),
    "",
    "--- PRECIOS ---",
    `Kit completo (Mototractor + Moto NKD 125cc 0km): $15.000.000 COP`,
    `Solo Mototractor: $9.800.000 COP`,

    "",
    "--- DATOS DE PRUEBAS ---",
    `1ra marcha: ${MOTOTRACTOR_KNOWLEDGE.pruebas.fuerzas_maximas.primera.fuerza_kg} kg a ${MOTOTRACTOR_KNOWLEDGE.pruebas.fuerzas_maximas.primera.rpm} RPM`,
    `2da marcha: ${MOTOTRACTOR_KNOWLEDGE.pruebas.fuerzas_maximas.segunda.fuerza_kg} kg a ${MOTOTRACTOR_KNOWLEDGE.pruebas.fuerzas_maximas.segunda.rpm} RPM`,
    `4ta marcha: ${MOTOTRACTOR_KNOWLEDGE.pruebas.fuerzas_maximas.cuarta.fuerza_kg} kg a ${MOTOTRACTOR_KNOWLEDGE.pruebas.fuerzas_maximas.cuarta.rpm} RPM`,
    `Pruebas de campo: ${MOTOTRACTOR_KNOWLEDGE.pruebas.prueba_campo.ubicacion}`,
    "",
    "--- MERCADO ---",
    `Precio: ${MOTOTRACTOR_KNOWLEDGE.ventajas.costo}`,
    `Segmentos: ${MOTOTRACTOR_KNOWLEDGE.mercado.segmentos.join(", ")}`,
    `Mercado Colombia: ${MOTOTRACTOR_KNOWLEDGE.mercado.mercado_colombia}`,
    "",
    "--- CONTACTOS ---",
    `Ventas y producción: Ángela Cuadrado 📱350 4515126`,
    `Servicio CRM: 📱3106743561`,
  ].join("\n");

  return base;
}
