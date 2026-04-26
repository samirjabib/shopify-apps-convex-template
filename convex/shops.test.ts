import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

describe("shops", () => {
  it("upsertInternal inserts a new shop", async () => {
    const t = convexTest(schema);
    await t.mutation(internal.shops.upsertInternal, {
      shop: "test-shop.myshopify.com",
      scope: "read_products",
    });
    const row = await t.query(internal.shops.getByShopInternal, {
      shop: "test-shop.myshopify.com",
    });
    expect(row).not.toBeNull();
    expect(row?.shop).toBe("test-shop.myshopify.com");
    expect(row?.scope).toBe("read_products");
    expect(row?.uninstalledAt).toBeUndefined();
  });

  it("upsertInternal updates existing shop and clears uninstalledAt", async () => {
    const t = convexTest(schema);
    await t.mutation(internal.shops.upsertInternal, {
      shop: "test-shop.myshopify.com",
      scope: "read_products",
    });
    await t.mutation(internal.shops.markUninstalledInternal, {
      shop: "test-shop.myshopify.com",
    });
    await t.mutation(internal.shops.upsertInternal, {
      shop: "test-shop.myshopify.com",
      scope: "read_products,write_orders",
    });
    const row = await t.query(internal.shops.getByShopInternal, {
      shop: "test-shop.myshopify.com",
    });
    expect(row?.scope).toBe("read_products,write_orders");
    expect(row?.uninstalledAt).toBeUndefined();
  });

  it("markUninstalledInternal sets uninstalledAt", async () => {
    const t = convexTest(schema);
    await t.mutation(internal.shops.upsertInternal, {
      shop: "x.myshopify.com",
    });
    await t.mutation(internal.shops.markUninstalledInternal, {
      shop: "x.myshopify.com",
    });
    const row = await t.query(internal.shops.getByShopInternal, {
      shop: "x.myshopify.com",
    });
    expect(typeof row?.uninstalledAt).toBe("number");
  });

  it("purgeByShopInternal deletes the shop row", async () => {
    const t = convexTest(schema);
    await t.mutation(internal.shops.upsertInternal, {
      shop: "doomed.myshopify.com",
    });
    await t.mutation(internal.shops.purgeByShopInternal, {
      shop: "doomed.myshopify.com",
    });
    const row = await t.query(internal.shops.getByShopInternal, {
      shop: "doomed.myshopify.com",
    });
    expect(row).toBeNull();
  });
});
