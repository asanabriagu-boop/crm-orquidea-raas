/**
 * cart-store.mjs — Store de Carritos de Compra
 * Carrito por contacto dentro de un tenant.
 */
import { BaseStore } from "./base-store.mjs";
import { Cart } from "../models.mjs";

export class CartStore extends BaseStore {
  constructor(tenantId = null) {
    super("carts", tenantId);
  }

  async create(data) {
    const cart = new Cart({ ...data, tenantId: this.tenantId });
    return this.put(cart.toJSON());
  }

  async findActiveByContact(contactId) {
    const all = await this.getAll();
    return all
      .filter(c => c.contactId === contactId && c.status === "active")
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0] || null;
  }

  async addItem(cartId, product, quantity = 1) {
    const cart = await this.get(cartId);
    if (!cart) return null;

    const existing = cart.items.find(i => i.productId === product.id);
    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.items.push({
        productId: product.id,
        name: product.name,
        unitPrice: product.price,
        quantity,
      });
    }

    cart.total = cart.items.reduce((sum, i) => sum + (i.unitPrice * i.quantity), 0);
    cart.updatedAt = new Date().toISOString();
    return this.put(cart);
  }

  async removeItem(cartId, productId) {
    const cart = await this.get(cartId);
    if (!cart) return null;

    cart.items = cart.items.filter(i => i.productId !== productId);
    cart.total = cart.items.reduce((sum, i) => sum + (i.unitPrice * i.quantity), 0);
    cart.updatedAt = new Date().toISOString();
    return this.put(cart);
  }

  async checkout(cartId) {
    const cart = await this.get(cartId);
    if (!cart) return null;
    cart.status = "checked_out";
    cart.updatedAt = new Date().toISOString();
    return this.put(cart);
  }
}
