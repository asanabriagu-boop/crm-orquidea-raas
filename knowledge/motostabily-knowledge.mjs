/**
 * motostabily-knowledge.mjs — Base de Conocimiento del tenant MotoStabily
 *
 * Tenant MotoStabily (slug `motostabily`) del grupo Mototractor. Reutiliza toda la
 * base técnica del Mototractor (mismo producto: especificaciones, patente,
 * pruebas, mercado) y sobreescribe solo la parte de marca.
 *
 * NOTA: el usuario entregará posteriormente la información real de MotoStabily
 * (technical support, customer service, pre-sales, sales) para alimentar el
 * chat flow. Este archivo es el punto de extensión — se enriquece sin cambiar
 * el registro de tenants ni el multi-agente.
 */

import { MOTOTRACTOR_KNOWLEDGE } from "./mototractor-knowledge.mjs";

export const MOTOSTABILY_KNOWLEDGE = {
  ...MOTOTRACTOR_KNOWLEDGE,

  general: {
    ...MOTOTRACTOR_KNOWLEDGE.general,
    name: "MotoStabily",
    tagline: "Ventas · Soporte técnico · Proyección financiera",
    description:
      "Dispositivo de tiro para labores agrícolas que se acopla entre motocicletas de trabajo y remolques o carretas agrícolas de un eje. Estabiliza la transferencia de carga desde el punto de enganche de la motocicleta hacia el implemento arrastrado, distribuyendo el peso de manera segura y permitiendo el transporte de cargas de hasta 200 kg en terrenos rurales. Producto en producción activa.",
    productor: "MotoStabily",
    direccion: "Consulte al asesor comercial o soporte técnico por la dirección de entrega/oficina actual.",
    desarrolladores: ["Equipo de Producto MotoStabily"],
    estado: "En producción activa",
    // 📞 Contacto de ventas y producción del tenant (para MotoStabily, NO es
    // Ángela Ni el número del Mototractor). Reemplaza el contacto común.
    contacto_ventas_produccion: {
      nombre: "Andrés Sanabria",
      telefono: "321 417 1508",
    },
    // 🔗 Link para ver el producto en acción (fotos, videos, demo, redes).
    // Landing/redes propios del MotoStabily (2026-08-25): ya no comparte la
    // marca social del Mototractor.
    ver_producto_url: "https://beacons.ai/motostabily_oficial",
    // 🎬 Video tutorial oficial de instalación (clips por timestamp). Fuente:
    // video del taller (agosto 2026). PENDIENTE: subir a CDN y reemplazar el
    // placeholder por la URL real de entrega del fragmento por timestamp (los
    // clips se referencian como `video_tutorial#t=MM:SS`). Mientras no haya CDN,
    // el agente NO debe enviar un enlace muerto: debe describir el paso en texto.
    video_tutorial: "PENDIENTE_CDN",
    // 🎯 Posicionamiento de marketing — estrategia de entrada:
    // se omite la asociación con Ideagro y se usa la herencia de confianza
    // del Mototractor ("de los mismos diseñadores del Mototractor").
    posicionamiento: {
      herencia: "De los mismos diseñadores del Mototractor llega el MotoStabily",
      omitir_produccion_ideagro: true,
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // FICHA TÉCNICA Y COMERCIAL (MotoStabily) — define CÓMO responde el
  // tenant MotoStabily del CRM. Fuente: MotoStabily/Ficha_Técnica_MotoStabily.md
  // ═══════════════════════════════════════════════════════════════
  ficha_tecnica: {
    product_id: "MOTOSTABILY-200",
    product_name: "MotoStabily",
    category: "dispositivo_tiro_agricola",
    subcategory: "enganche_arrastre_motocicleta",
    max_load_kg: 200,
    status: "produccion_activa",
    currency: "COP",
    // Precios
    price_cop: 1199000,
    price_human: "$1.199.000 COP",
    price_includes_shipping: false,
    shipping_policy:
      "El precio base no incluye envío. Opción A: el cliente paga el costo de envío contra entrega. Opción B: nosotros asumimos el envío sumando el costo logístico al precio base.",
    // Kit con moto — RETIRADO (2026-08-22): ya no se trabaja la opción de
    // kit (MotoStabily + Moto AKT NKD 125 0 km). El agente solo vende el
    // dispositivo individual.
    kit_available: false,
    // Comparativo de precio SUPRIMIDO para el MotoStabily: la comparación
    // "80-90% más económico que un tractor convencional" es un argumento de
    // venta propio del Mototractor y no corresponde a este producto. Al dejarlo
    // en null, el buildSalesPrompt omite ese mensaje para este tenant.
    comparativo_precio: null,
    // ══════════════════════════════════════════════════════════════
    // MÉTODOS DE PAGO (MotoStabily) — fuente: MotoStabily/ChatFlow_Pagos_MotoStabily.md
    // El agente SIEMPRE presenta dos opciones en este orden, recomendando
    // Bre-B por rapidez. Los datos bancarios NUNCA se comparten de forma
    // proactiva; solo después de que el cliente confirme intención de compra.
    // ══════════════════════════════════════════════════════════════
    pagos: {
      // Instrucción global para el agente de ventas.
      presentar_opciones:
        "El cliente tiene DOS opciones de pago. Preséntalas SIEMPRE en este orden: (1) Bre-B — transferencia inmediata multibancaria, RECOMENDADA, llega en segundos 24/7 (incluidos fines de semana y festivos), GRATIS para el usuario; (2) Transferencia bancaria tradicional a Davivienda — puede tardar de 1 a 24 horas hábiles entre bancos diferentes y NO se procesa en fines de semana ni festivos. También existen: contra entrega (paga al recibir) y envío incluido (se suma el costo al precio).",
      // Dato clave de venta: por qué recomendar Bre-B.
      por_que_bre_b:
        "Bre-B es el Sistema de Pagos Inmediatos e Interoperables de Colombia (Banco de la República). Con Bre-B el pago llega en segundos sin importar el día ni la hora, mientras que la transferencia tradicional entre bancos diferentes puede tardar de 1 a 24 horas hábiles y un pago hecho en fin de semana o festivo sólo se procesa el siguiente día hábil.",
      bre_b: {
        method: "bre_b",
        name: "Bre-B (Transferencia Inmediata Multibancaria)",
        recommended: true,
        priority: 1,
        settlement_time: "inmediato — llega en segundos",
        availability: "24 horas al día, 7 días a la semana, incluidos fines de semana y festivos",
        cost: "GRATIS para el usuario (hasta 2029)",
        banks: "Todos los bancos y billeteras digitales: Bancolombia, Nequi, Daviplata, BBVA, Banco de Bogotá, Scotiabank, etc.",
        max_amount: "Hasta $12.110.000 COP por transacción",
        // 🔑 Llave Bre-B del titular (del QR Bre-B de Davivienda). Es la única
        // forma de recibir el pago por Bre-B: el cliente la ingresa en su app.
        llave_breb: "@DAVI3192233287",
        recipient_name: "WILSON MEDINA RUBIANO",
        keys: "Con Bre-B se paga con la LLAVE del receptor (@DAVI3192233287); no es necesario compartir el número de cuenta completo. Solo se usa esta llave para recibir el pago.",
        steps_for_client: [
          "Abre la app de tu banco o billetera digital y busca la opción Bre-B o Pagos inmediatos.",
          "Ingresa la LLAVE Bre-B del receptor: @DAVI3192233287.",
          "Verifica que el nombre del receptor sea: WILSON MEDINA RUBIANO.",
          "Ingresa el monto exacto (por ej. $1.199.000 COP).",
          "Confirma la transacción — el dinero llega al instante.",
          "Envía el comprobante (captura) para validar el pago.",
        ],
      },
      transferencia_tradicional: {
        method: "bank_transfer_traditional",
        name: "Transferencia Bancaria Tradicional",
        recommended: false,
        priority: 2,
        settlement_time: "1 a 24 horas hábiles",
        availability: "Solo en horario bancario (lunes a viernes)",
        bank: "Davivienda S.A.",
        account_type: "Cuenta de Ahorros Damas",
        account_number: "0550488456080123",
        account_holder: "WILSON MEDINA RUBIANO",
        holder_document: "Cédula de Ciudadanía 1030661158",
        bank_nit: "860.034.313-7",
        warning:
          "Entre bancos diferentes la transferencia puede tardar hasta 24 horas hábiles; los pagos de fines de semana o festivos se procesan el siguiente día hábil.",
      },
      contra_entrega: {
        method: "cash_on_delivery",
        name: "Contra Entrega",
        settlement_time: "paga al recibir el producto",
        shipping_cost: "variable según ciudad — el cliente paga el transporte al entregar",
        conditions:
          "El producto se paga previamente o contra entrega según acuerdo. Se necesita la ciudad y si es zona urbana o rural para cotizar el envío.",
      },
      envio_incluido: {
        method: "shipping_included",
        name: "Pago con Envío Incluido",
        settlement_time: "se suma el costo de envío al precio base y el cliente paga el total antes del despacho",
      },
      // Políticas.
      politica_reserva_horas: 24,
      politica_envio: "El envío se programa únicamente después de confirmar el pago completo.",
      // ⚠️ Regla de seguridad crítica.
      security_rules: [
        "NUNCA compartas datos bancarios (cuenta Davivienda 0550488456080123) de forma proactiva ni en el primer mensaje.",
        "Solo comparte los datos de la cuenta cuando el cliente haya CONFIRMADO intención de compra y haya elegido transferencia bancaria tradicional como método.",
        "Bre-B no requiere compartir número de cuenta: con la llave Bre-B (@DAVI3192233287) es suficiente.",
        "Siempre valida el comprobante de pago antes de confirmar el envío.",
        "El producto se reserva por 24 horas tras confirmar el método de pago.",
      ],
    },
    // ══════════════════════════════════════════════════════════════
    // FACTURA ELECTRÓNICA (MotoStabily) — cierre de compra
    // Cuando el cliente TERMINA su compra y está por emitirse la factura
    // electrónica, el agente de ventas debe consultar de forma PROACTIVA el
    // correo electrónico al que desea que se envíe, y confirmarle que será
    // enviada a esa dirección. No se solicita en pre-venta ni en el primer
    // contacto: solo al cerrar la venta.
    // ══════════════════════════════════════════════════════════════
    facturacion: {
      activo: true,
      trigger: "al completar la compra y emitirse la factura electrónica",
      // Frase con la que el agente pide proactivamente el correo.
      preguntar_email:
        "Para hacerte llegar tu factura electrónica, ¿a cuál correo electrónico deseas que la enviemos?",
      // Frase de confirmación (el agente sustituye {email} por el correo indicado).
      confirmar_envio:
        "¡Listo! Tu factura electrónica será enviada al correo {email}. Te la hacemos llegar apenas quede emitida.",
      reglas: [
        "Al FINALIZAR la compra (deal en closed_won) y antes de cerrar la conversación, pregunta SIEMPRE de forma proactiva por el correo electrónico al que se enviará la factura.",
        "Cuando el cliente indique su correo, confírmale expresamente que la factura electrónica será enviada a esa dirección, usando la frase de confirmación.",
        "NO pidas el correo en el primer contacto ni durante la pre-venta: solo cuando la compra ya esté cerrada y se vaya a emitir la factura.",
        "Si el cliente no recuerda el correo o prefiere darlo luego, ofrécele pasarlo por WhatsApp al contacto de ventas en lugar de insistir.",
      ],
    },
    // Descripción funcional
    descripcion_funcional:
      "Dispositivo de tiro que se acopla entre motocicletas de trabajo y remolques o carretas agrícolas de un eje. Distribuye el peso de manera segura, transportando hasta 200 kg en terrenos rurales, caminos vecinales y superficies no pavimentadas. NO es un remolque: es un adaptador/enganche de arrastre.",
    componentes_principales_motostabily: [
      "Estructura de enganche principal — armazón metálico de acero soldado fijado al chasis trasero con pernos de alta resistencia",
      "Rueda estabilizadora intermedia — llanta agrícola de tacos profundos y aro metálico rojo; punto de apoyo intermedio que reduce la carga sobre el tren trasero",
      "Sistema de articulación — pivote con bujes reforzados para movimiento angular en terrenos irregulares",
      "Placa de acoplamiento — superficie plana con pasador de seguridad para conexión rápida con remolques tipo horquilla",
      "Eje de transmisión/tracción auxiliar (según configuración) — ruedas agrícolas grandes con sistema de cadena",
    ],
    especificaciones_tecnicas: {
      capacidad_nominal_carga: "200 kg",
      tipo_acoplamiento: "Enganche de arrastre tipo horquilla con pasador de seguridad",
      material_estructura: "Acero estructural carbono, tratamiento anticorrosivo (pintura electrostática)",
      rueda_estabilizadora: "Llanta agrícola reforzada con tacos profundos, aro metálico rojo",
      sistema_articulacion: "Pivote con bujes de polímero auto-lubricados",
      compatibilidad_motos:
        "Motocicletas naked y de trabajo con chasis reforzado (ej. AKT NKD 125/150, Yamaha FZ/MT series, modelos 125-250cc)",
      remolques_compatibles: 'Carretas agrícolas de un eje tipo "IDEAGRO" o similares',
      peso_aproximado_dispositivo: "35-45 kg (estimado)",
      dimensiones_aproximadas: "Largo 180-220 cm; Ancho 80-100 cm",
    },
    limites_operacion: {
      carga_maxima: "200 kg (incluyendo peso del remolque vacío si aplica)",
      velocidad_maxima_con_carga: "30-40 km/h en caminos consolidados",
      velocidad_maxima_sin_carga: "50 km/h",
      uso_permitido: "Exclusivo en terrenos rurales, caminos vecinales y predios agrícolas",
      uso_prohibido:
        "Vías primarias pavimentadas a alta velocidad; transporte de personas; cargas que excedan el límite nominal",
    },
    // Guiones de atención al cliente (cómo debe responder)
    scripts_cliente: {
      ventas_producto_individual:
        "Buen día. El dispositivo MotoStabily tiene un precio de $1.199.000 COP, no incluye envío. Al confirmar tu compra tienes dos opciones de pago: (1) Bre-B, transferencia inmediata multibancaria — RECOMENDADA, llega en segundos 24/7 y es gratis; (2) transferencia bancaria tradicional a Davivienda. También puedes pagar contra entrega, o incluir el envío sumando el costo al precio. ¿Prefieres que te cuente más de alguna? Para el total con envío incluido, ¿en qué ciudad te encuentras?",
      soporte_instalacion:
        "Para verificar la instalación confirme tres puntos: 1) el enganche está fijado al chasis trasero de la moto, no a carenados o plásticos; 2) la rueda estabilizadora del medio toca el suelo con carga; 3) no excede los 200 kg de carga total.",
      soporte_restricciones:
        "El MotoStabily es de uso exclusivo agrícola en predios rurales y caminos vecinales. En vías públicas pavimentadas puede estar sujeto a regulaciones de tránsito. Nunca supere los 200 kg. Antes de cada uso verifique pernos de enganche, presión de la rueda estabilizadora y distribución de la carga.",
    },
    kb_tags: [
      "enganche",
      "remolque_agricola",
      "moto_herramienta",
      "carga_200kg",
      "IDEAGRO",
      "labores_agricolas",
      "transporte_rural",
      "contra_entrega",
      "MOTOSTABILY-200",
    ],
  },

  // ═════════════════════════════════════════════════════════════
  // TUTORIAL DE INSTALACIÓN (MotoStabily) — define CÓMO guía el agente de
  // SOPORTE la instalación paso a paso con texto + clips de video por etapa.
  // Fuente: ChatFlow_Instalacion_MotoStabily.md (v1.1.0, 2026-08-24).
  // ═════════════════════════════════════════════════════════════
  instalacion_tutorial: {
    version: "1.1.0",
    objective:
      "Guiar al cliente por los 7 pasos de instalación del MotoStabily con confirmación por etapa, derivar a humano solo cuando sea necesario, y registrar eventos por paso para analítica/garantía.",
    // 🔑 Llave para detectar el trigger y encender el modo tutorial.
    triggers: [
      "instalar",
      "instalación",
      "tutorial",
      "manual",
      "como lo armo",
      "como armo",
      "como se instala",
      "ayuda con el montaje",
    ],
    // Video base: los clips se referencian como `videoTutorial#t=MM:SS`.
    // Mientras el CDN no esté publicado (video_tutorial === "PENDIENTE_CDN"),
    // el agente describe el paso en texto puro y NO envía enlace muerto.
    // tiempo_estimado en la §guion.
    caja_y_herramientas: {
      piezas: [
        "2 brazos laterales (canales ranurados)",
        "2 anclajes de basculante",
        "1 soporte ranurado tipo 'L' (lado caliper)",
        "1 dolly con 2 ruedas (rin rojo)",
        "2 varillas roscadas + juego de pernos, tuercas y arandelas",
        "barra de remolque",
      ],
      herramientas: [
        "flexómetro",
        "juego de llaves",
        "martillo",
        "ratchet",
        "presi (pinza de presión)",
        "guantes",
      ],
    },
    // 7 pasos en orden. `clip` es el timestamp MM:SS dentro del video tutorial.
    pasos: [
      {
        numero: 1,
        titulo: "Mediciones preliminares",
        clip: "00:04",
        ref_mediciones: "altura libre del basculante 5-8 cm; libre del amortiguador 4-8 cm",
        detalles:
          "Con la moto apoyada, mide con flexómetro la altura libre del basculante cerca del eje trasero (ref. 5-8 cm) y el libre del amortiguador (ref. 4-8 cm) para validar holgura de los soportes. Marca con marcador los puntos de anclaje en ambos lados. Verifica que queden libres: cadena, disco y manguera de freno. Validado en el video con Yamaha FZ y AKT.",
      },
      {
        numero: 2,
        titulo: "Anclajes al basculante",
        clip: "01:08",
        detalles:
          "Con guantes, presenta el anclaje lateral sobre el basculante. Pasa la varilla roscada por el orificio; si ajusta, da toques suaves con martillo (como en el video). Coloca arandela y tuerca en ambos extremos; aún NO aprietes a tope. Repite en el lado contrario.",
      },
      {
        numero: 3,
        titulo: "Brazos laterales",
        clip: "02:41",
        detalles:
          "Desliza el brazo metálico (canal) sobre el anclaje instalado. Alinea la ranura con la varilla roscada. Inserta el perno largo y deja la tuerca apretada a mano.",
      },
      {
        numero: 4,
        titulo: "Soporte del caliper (lado disco)",
        clip: "03:13",
        detalles:
          "Usa la pieza 'L' ranurada. Móntala en el lado del caliper sin tocar disco ni manguera hidráulica. Ajusta con llave hasta quedar firme, sin forzar. Gira la rueda a mano: debe girar libre y sin roces. Si sientes roce en el disco, reubica el soporte antes de continuar.",
      },
      {
        numero: 5,
        titulo: "Dolly con ruedas",
        clip: "07:37",
        clip_apriete: "16:14",
        detalles:
          "Acerca el dolly y encaja su travesaño sobre los brazos laterales. Elige la posición en las ranuras de ajuste (se adaptan al largo del basculante). Sujeta la tuerca con presi y aprieta el perno con ratchet (técnica del video). Verifica que el conjunto quede centrado visto desde atrás.",
      },
      {
        numero: 6,
        titulo: "Conexión al remolque",
        clip: "10:55",
        detalles:
          "Alinea la barra de remolque del dolly con el acople del remolque (tipo SAGRO o similar). Asegura con pasador/perno y confirma el seguro. Revisa que el conjunto moto-dolly-remolque quede en línea recta.",
      },
      {
        numero: 7,
        titulo: "Verificación final y prueba",
        clip: "11:14",
        detalles:
          "Apriete final de toda la tornillería (patrón cruzado, ratchet). Rueda del dolly y rueda trasera girando libres. Prueba de rodaje a baja velocidad en zona segura. Re-aprieta tornillería tras los primeros 10 km.",
      },
    ],
    guion: {
      bienvenida:
        "Hola {CLIENTE}, te saluda el asistente de {TENANT}. Veo que escribiste por la instalación. Puedo guiarte paso a paso. Empecemos verificando tu caja y herramientas.",
      caja_lista: "¿Todo listo en tu caja y herramientas?",
      peticion_paso:
        "Vamos con el paso {N}. {TITULO}. ¿Me confirmas que lo terminaste para seguir al siguiente?",
      clip_texto: "El clip de este paso inicia en el minuto {CLIP} del video tutorial.",
      listo: "Perfecto, siguiente paso.",
      repetir: "Sin problema, te repito el paso {N}: {TITULO}. {DETALLES}",
      asesor:
        "Te transfiero con un técnico de {TENANT}. Pendiente agendar con el soporte.",
      terminar:
        "¡Listo, {CLIENTE}! Tu MotoStabily quedó instalado. Tu respuesta activa la garantía del producto. Del 1 al 5, ¿qué tan fácil fue la instalación?",
      tiempo_estimado: "60 minutos",
    },
    // Reglas de comportamiento para el agente de soporte.
    reglas: [
      "Cuando el cliente pida instalación/tutorial/manual, entra al modo tutorial y guíalo paso a paso N1→N7 con confirmación por etapa.",
      "Antes del paso 1, verifica la caja y las herramientas (caja_y_herramientas).",
      "Si el clip puede publicarse (video_tutorial !== 'PENDIENTE_CDN'), comparte el link del clip correspondiente; si no, describe el paso en texto sin enviar enlaces muertos.",
      "Confirma cada paso antes de avanzar. 'Listo' avanza, 'Repetir' reenvía el paso, 'Asesor' deriva a humano.",
      "Si reportan roce/freno/flojo o mencionan 'no funciona', alerta prioridad y deriva a humano.",
      "Ante duda de tipo de moto, indica compatibilidad con basculante estándar (validado con Yamaha FZ y AKT) y preguntar el modelo.",
    ],
    eventos: {
      inicio: "evt_tutorial_inicio",
      paso: "evt_paso_{N}_ok",
      fin: "evt_tutorial_fin",
      csat: "evt_csat_{score}",
      handoff: "evt_handoff",
    },
  },
};
