/**
 * product-store.mjs — Store de Productos
 * Catálogo de productos por tenant.
 */
import { BaseStore } from "./base-store.mjs";
import { Product } from "../models.mjs";

export class ProductStore extends BaseStore {
  constructor(tenantId = null) {
    super("products", tenantId);
  }

  async create(data) {
    const product = new Product({ ...data, tenantId: this.tenantId });
    return this.put(product.toJSON());
  }

  async findByCategory(category) {
    const all = await this.getAll();
    return all.filter(p => p.category === category && p.isActive !== false);
  }

  async search(query) {
    const all = await this.getAll();
    const q = query.toLowerCase();
    return all.filter(p =>
      p.isActive !== false &&
      (p.name?.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q))
    );
  }

  async getActive() {
    return this.find(p => p.isActive !== false);
  }
}
