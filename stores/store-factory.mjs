/**
 * store-factory.mjs — Factory multi-tenant para stores
 *
 * Reemplaza el patrón singleton. Cada tenant obtiene su propio
 * grupo de stores (contacts, deals, conversations) que persisten
 * en data/{tenantId}/.
 *
 * Uso:
 *   const stores = StoreFactory.forTenant();
 *   const contact = await stores.contacts.findByPhone("...");
 *   await stores.deals.create({ ... });
 */
import { ContactStore } from "./contact-store.mjs";
import { DealStore } from "./deal-store.mjs";
import { ConversationStore } from "./conversation-store.mjs";
import { ProductStore } from "./product-store.mjs";
import { CartStore } from "./cart-store.mjs";
import { PaymentStore } from "./payment-store.mjs";

const _tenantStores = new Map();

export class StoreFactory {
  /**
   * Obtiene stores para un tenant específico.
   * @param {string|null} tenantId — null = default (Mototractor original)
   * @returns {{ contacts: ContactStore, deals: DealStore, conversations: ConversationStore, products: ProductStore, carts: CartStore, payments: PaymentStore }}
   */
  static forTenant(tenantId = null) {
    const key = tenantId || "__default__";
    if (!_tenantStores.has(key)) {
      const tid = tenantId || null;
      _tenantStores.set(key, {
        contacts: new ContactStore(tid),
        deals: new DealStore(tid),
        conversations: new ConversationStore(tid),
        products: new ProductStore(tid),
        carts: new CartStore(tid),
        payments: new PaymentStore(tid),
      });
    }
    return _tenantStores.get(key);
  }

  /** Limpia caché de stores (útil en tests) */
  static reset(tenantId = null) {
    if (tenantId) {
      _tenantStores.delete(tenantId);
    } else {
      _tenantStores.clear();
    }
  }
}
