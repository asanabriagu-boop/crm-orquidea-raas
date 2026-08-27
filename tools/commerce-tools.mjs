/**
 * commerce-tools.mjs — Tools de Comercio para el CRM
 *
 * Catálogo de productos, carrito de compras y pagos.
 * Cada tool recibe los stores como dependencia (factory pattern).
 */
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { mockGateway } from "../payment/mock-gateway.mjs";

/**
 * Crea las tools de comercio para un tenant específico.
 * @param {Object} stores - { productStore, cartStore, dealStore, paymentStore, contactStore }
 * @param {string} baseUrl - URL base del servidor para links de pago
 * @returns {DynamicStructuredTool[]}
 */
export function createCommerceTools(stores, baseUrl = "http://localhost:3030") {
  const { productStore, cartStore, dealStore, paymentStore, contactStore } = stores;

  return [
    new DynamicStructuredTool({
      name: "listar_productos",
      description: "Lista los productos del catálogo. Opcionalmente filtra por categoría o busca por nombre. El usuario puede pedir 'el catálogo', 'los productos', 'qué venden', etc.",
      schema: z.object({
        categoria: z.string().optional().describe("Filtrar por categoría: fertilizantes, semillas, riego, control-plagas, herramientas, insumos"),
        busqueda: z.string().optional().describe("Buscar por nombre o descripción"),
      }),
      func: async ({ categoria, busqueda }) => {
        let products;
        if (busqueda) {
          products = await productStore.search(busqueda);
        } else if (categoria) {
          products = await productStore.findByCategory(categoria);
        } else {
          products = await productStore.getActive();
        }

        if (products.length === 0) {
          return "No se encontraron productos. Prueba otra categoría o búsqueda.";
        }

        const lines = products.map((p, i) =>
          `${i + 1}. **${p.name}** — $${p.price.toLocaleString()}\n   ${p.description || ""}\n   📂 Categoría: ${p.categoria || p.category}`
        );

        return `📦 **Catálogo de Productos** (${products.length})\n\n${lines.join("\n\n")}\n\n_Pregunta por el precio o agrega productos al carrito con "agregar [producto] al carrito"._`;
      },
    }),

    new DynamicStructuredTool({
      name: "agregar_al_carrito",
      description: "Agrega un producto al carrito de compras del contacto. Necesitas el nombre del producto y opcionalmente la cantidad. ÚSALA cuando el usuario diga 'quiero comprar', 'agrega', 'añade', 'llevo', 'me llevo' un producto.",
      schema: z.object({
        nombreProducto: z.string().describe("Nombre del producto a agregar"),
        cantidad: z.number().optional().default(1).describe("Cantidad a agregar (por defecto 1)"),
        contactId: z.string().describe("ID del contacto que está comprando"),
        conversationId: z.string().optional().describe("ID de la conversación actual"),
      }),
      func: async ({ nombreProducto, cantidad = 1, contactId, conversationId }) => {
        const products = await productStore.search(nombreProducto);
        if (products.length === 0) {
          return `❌ No encontré un producto llamado "${nombreProducto}". Usa 'listar_productos' para ver el catálogo.`;
        }

        const product = products[0]; // tomar el primero más relevante

        let cart = await cartStore.findActiveByContact(contactId);
        if (!cart) {
          cart = await cartStore.create({
            contactId,
            conversationId: conversationId || null,
          });
        }

        const updated = await cartStore.addItem(cart.id, product, cantidad);
        return `✅ Agregado al carrito: **${cantidad}x ${product.name}** — $${(product.price * cantidad).toLocaleString()}\n\n🛒 Total actual: $${updated.total.toLocaleString()}\n\n¿Quieres algo más o prefieres **finalizar la compra**?`;
      },
    }),

    new DynamicStructuredTool({
      name: "ver_carrito",
      description: "Muestra el contenido actual del carrito de compras del contacto.",
      schema: z.object({
        contactId: z.string().describe("ID del contacto"),
      }),
      func: async ({ contactId }) => {
        const cart = await cartStore.findActiveByContact(contactId);
        if (!cart || cart.items.length === 0) {
          return "🛒 Tu carrito está vacío. ¿Quieres ver nuestro catálogo de productos?";
        }

        const items = cart.items.map((i, idx) =>
          `${idx + 1}. **${i.name}** — ${i.quantity}x $${i.unitPrice.toLocaleString()} = $${(i.quantity * i.unitPrice).toLocaleString()}`
        );

        return `🛒 **Tu Carrito**\n\n${items.join("\n")}\n\n💰 **Total: $${cart.total.toLocaleString()}**\n\n¿Confirmas la compra?`;
      },
    }),

    new DynamicStructuredTool({
      name: "finalizar_compra",
      description: "Finaliza la compra: crea un deal, genera un link de pago y envía al contacto para que pague. USA ESTA HERRAMIENTA cuando el usuario confirme la compra (diga 'sí', 'confirmo', 'pagar', 'finalizar', 'comprar').",
      schema: z.object({
        contactId: z.string().describe("ID del contacto"),
        conversationId: z.string().optional().describe("ID de la conversación actual"),
      }),
      func: async ({ contactId, conversationId }) => {
        const cart = await cartStore.findActiveByContact(contactId);
        if (!cart || cart.items.length === 0) {
          return "❌ No hay productos en el carrito. Agrega productos primero con 'agregar_al_carrito'.";
        }

        // Obtener contacto para el título del deal
        const contact = await contactStore.get(contactId);
        const contactName = contact ? contact.name : "Cliente";

        // Crear deal
        const deal = await dealStore.create({
          contactId,
          title: `Compra ${contactName} — $${cart.total.toLocaleString()}`,
          value: cart.total,
          stage: "proposal",
          source: "webchat",
        });

        // Checkout del carrito
        await cartStore.checkout(cart.id);

        // Crear intención de pago
        const paymentResult = await mockGateway.createPaymentLink({
          dealId: deal.id,
          amount: cart.total,
          reference: `REF-${deal.id.slice(0, 8)}`,
          description: `Pago de ${contactName} — ${cart.items.map(i => i.name).join(", ")}`,
          baseUrl,
        });

        // Guardar payment
        const payment = await paymentStore.create({
          dealId: deal.id,
          amount: cart.total,
          gateway: "mock",
          gatewayLink: paymentResult.link,
          status: "pending",
        });

        // Resumen de items
        const itemsSummary = cart.items
          .map(i => `• ${i.name} — ${i.quantity}x $${i.unitPrice.toLocaleString()}`)
          .join("\n");

        return [
          `✅ **Compra registrada exitosamente**`,
          ``,
          `📋 **Resumen:**`,
          itemsSummary,
          `💰 **Total: $${cart.total.toLocaleString()}**`,
          `🆔 Deal: ${deal.id.slice(0, 8)}...`,
          ``,
          `💳 **Link de pago:**`,
          paymentResult.link,
          ``,
          `_Haz clic en el link para pagar. Simula el proceso de pago._`,
        ].join("\n");
      },
    }),

    new DynamicStructuredTool({
      name: "verificar_pago",
      description: "Verifica si un pago ya fue realizado. Después de que el usuario paga, usa esta tool para confirmar y actualizar el deal a 'closed_won'.",
      schema: z.object({
        dealId: z.string().describe("ID del deal a verificar"),
      }),
      func: async ({ dealId }) => {
        const payments = await paymentStore.findByDeal(dealId);
        if (payments.length === 0) {
          return "❌ No se encontraron pagos asociados a este deal.";
        }

        const payment = payments[0];
        if (payment.status === "paid") {
          // Actualizar deal a closed_won
          const deal = await dealStore.updateStage(dealId, "closed_won");
          return [
            `✅ **Pago confirmado!**`,
            `💰 Monto: $${payment.amount.toLocaleString()}`,
            `🆔 Transacción: ${payment.id.slice(0, 8)}...`,
            `🎉 **¡Deal cerrado con éxito!** El deal se ha movido a 'closed_won'.`,
            deal ? `📊 Pipeline actualizado.` : "",
          ].filter(Boolean).join("\n");
        } else if (payment.status === "failed") {
          return `❌ El pago falló. ¿Quieres intentar de nuevo con otro método?`;
        } else {
          return `⏳ El pago está pendiente. El link es: ${payment.gatewayLink}\n\n_¿Ya realizaste el pago? Haz clic en el link y presiona "Pagar" para simular._`;
        }
      },
    }),
  ];
}
