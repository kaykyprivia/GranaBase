import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type RpcJson = Record<string, unknown>;

type E2EContext = {
  admin: SupabaseClient;
  clientA: SupabaseClient;
  clientB: SupabaseClient;
  email: string;
  password: string;
  runId: string;
  userId: string;
  workspaceId: string;
  productId: string;
  purchaseOrderId: string;
  purchaseItemId: string;
  saleId: string;
};

const e2eEmailPrefix = "granabase-e2e+";
const e2eEmailDomain = "@example.com";
const consoleErrors: string[] = [];
const pageErrors: string[] = [];
const serverErrors: string[] = [];

const userOwnedTables = [
  "notifications",
  "business_sale_return_items",
  "business_sale_returns",
  "business_sale_item_allocations",
  "business_payments",
  "business_sale_items",
  "business_sales",
  "business_inventory_movements",
  "business_inventory_lots",
  "business_purchase_payments",
  "business_purchase_items",
  "business_purchase_orders",
  "business_expenses",
  "business_customers",
  "business_products",
  "business_product_categories",
  "business_audit_logs",
  "business_operation_idempotency",
  "business_workspaces",
] as const;

test.describe.configure({ mode: "serial" });

test.describe("Business V2 authenticated UI and concurrency", () => {
  let ctx: E2EContext | undefined;

  test.beforeAll(async ({}, testInfo) => {
    const env = loadEnv();
    const supabaseUrl = requireEnv(env, "NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = requireEnv(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceRoleKey = requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
    const projectSuffix = testInfo.project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const runId = `${Date.now()}-${projectSuffix}-${randomUUID().slice(0, 8)}`;
    const admin = makeClient(supabaseUrl, serviceRoleKey);

    await cleanupOldE2EUsers(admin);

    const email = `${e2eEmailPrefix}${runId}${e2eEmailDomain}`;
    const password = `E2E-${randomUUID().slice(0, 8)}-${randomUUID().slice(0, 8)}aA1!`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(createError, createError?.message).toBeNull();
    const userId = created.user?.id;
    expect(userId).toBeTruthy();

    const clientA = makeClient(supabaseUrl, anonKey);
    const clientB = makeClient(supabaseUrl, anonKey);
    await signIn(clientA, email, password);
    await signIn(clientB, email, password);

    try {
      const seeded = await seedBusinessData(clientA, runId);
      ctx = {
        admin,
        clientA,
        clientB,
        email,
        password,
        runId,
        userId: userId!,
        ...seeded,
      };
    } catch (error) {
      await cleanupUser(admin, userId!);
      await admin.auth.admin.deleteUser(userId!);
      throw error;
    }
  });

  test.afterAll(async () => {
    if (!ctx) return;
    try {
      await cleanupUser(ctx.admin, ctx.userId);
    } finally {
      await ctx.admin.auth.admin.deleteUser(ctx.userId);
      await cleanupOldE2EUsers(ctx.admin);
    }
  });

  test.beforeEach(async ({ page }) => {
    consoleErrors.length = 0;
    pageErrors.length = 0;
    serverErrors.length = 0;

    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 500) {
        serverErrors.push(`${response.status()} ${response.url()}`);
      }
    });
  });

  test("authenticated Business V2 UI works on desktop and mobile", async ({ page }) => {
    expect(ctx).toBeDefined();
    await login(page, ctx!);

    const pages = [
      { label: "Dashboard Negócio", path: "/business", expectText: "Negócio" },
      { label: "Compras", path: "/business/purchases", expectText: "Compras" },
      { label: "Nova Compra", path: "/business/purchases/new", expectText: "Nova compra" },
      {
        label: "Detalhe Compra",
        path: `/business/purchases/${ctx!.purchaseOrderId}`,
        expectText: "Compra",
      },
      { label: "Estoque", path: "/business/inventory", expectText: "Estoque" },
      {
        label: "Detalhe Produto",
        path: `/business/inventory/${ctx!.productId}`,
        expectText: "__E2E__ Base Product",
      },
      { label: "Clientes", path: "/business/customers", expectText: "Clientes" },
      { label: "Vendas", path: "/business/sales", expectText: "Vendas" },
      { label: "Nova Venda", path: "/business/sales/new", expectText: "Nova venda" },
      {
        label: "Detalhe Venda",
        path: `/business/sales/${ctx!.saleId}`,
        expectText: "Venda",
      },
      { label: "Despesas", path: "/business/expenses", expectText: "Despesas" },
      { label: "Fluxo de Caixa", path: "/business/cash-flow", expectText: "Fluxo de Caixa" },
    ];

    for (const item of pages) {
      await validatePage(page, item.path, item.label, item.expectText);
    }

    await validateCustomer360(page);
    await validatePurchaseCategoryFlow(page, ctx!.purchaseOrderId);
    await validateProductCategoryFlow(page, ctx!.productId);
    await validateSalePaymentDialog(page, ctx!.saleId);
  });

  test("real app-layer concurrency keeps business invariants", async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Concurrency is project-independent and runs once.");
    expect(ctx).toBeDefined();

    await assertLastUnitConcurrency(ctx!);
    await assertSalePaymentConcurrency(ctx!);
    await assertPurchasePaymentConcurrency(ctx!);
    await assertDuplicateCategoryConcurrency(ctx!);
    await assertDuplicateSkuConcurrency(ctx!);
  });
});

async function login(page: Page, ctx: E2EContext) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(ctx.email);
  await page.locator('input[type="password"]').fill(ctx.password);
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  await page.waitForURL(/\/(dashboard|business)/, { timeout: 30_000 });
}

async function validatePage(page: Page, path: string, label: string, expectedText: string) {
  await page.goto(path);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await expect(page.locator("body"), label).toContainText(expectedText, { timeout: 15_000 });
  await expect(page.locator("body"), label).not.toContainText(/Application error|Unhandled Runtime Error/i);
  expect(serverErrors, `${label}: HTTP 5xx responses`).toEqual([]);
  expect(pageErrors, `${label}: uncaught page errors`).toEqual([]);
  expect(consoleErrors, `${label}: console errors`).toEqual([]);

  const loadingCount = await page.getByText(/Carregando|Loading/i).count();
  expect(loadingCount, `${label}: loading indicators still visible`).toBe(0);

  const hasHorizontalOverflow = await page.evaluate(() => {
    const maxWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    return maxWidth > window.innerWidth + 16;
  });
  expect(hasHorizontalOverflow, `${label}: horizontal overflow`).toBe(false);
}

async function validateCustomer360(page: Page) {
  await page.goto("/business/customers");
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.getByRole("button", { name: "Ver detalhes" }).first().click();
  await expect(page.getByRole("dialog")).toContainText("Detalhes do cliente");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function validatePurchaseCategoryFlow(page: Page, purchaseOrderId: string) {
  await page.goto("/business/purchases/new");
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.getByRole("button", { name: "Novo produto" }).first().click();
  await expect(page.locator("body")).toContainText("Categoria");

  await page.goto(`/business/purchases/${purchaseOrderId}`);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await expect(page.locator("body")).toContainText(/Produtos da compra|Itens no pedido/i);
}

async function validateProductCategoryFlow(page: Page, productId: string) {
  await page.goto(`/business/inventory/${productId}`);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await expect(page.locator("body")).toContainText(/Categoria|category/i);
  await page.getByRole("button", { name: /Editar/i }).first().click();
  await expect(page.getByRole("dialog")).toContainText(/Categoria|Editar produto/i);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function validateSalePaymentDialog(page: Page, saleId: string) {
  await page.goto(`/business/sales/${saleId}`);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.getByRole("button", { name: /Pagamento|Registrar pagamento/i }).first().click();
  await expect(page.getByRole("dialog")).toContainText(/Pagamento|pagamento/i);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function seedBusinessData(client: SupabaseClient, runId: string) {
  const workspace = await rpc<RpcJson>(
    client,
    "get_or_create_business_workspace",
    { p_name: `E2E ${runId}` },
  );
  const workspaceId = stringField(workspace, "workspace_id");

  const purchase = await createAndReceiveProduct(client, workspaceId, runId, "Base Product", 10, 10, 30);
  const customer = await insertCustomer(client, workspaceId, `__E2E__ Customer ${runId}`);

  const sale = await rpc<RpcJson>(client, "create_business_sale", {
    p_workspace_id: workspaceId,
    p_items: [
      {
        product_id: purchase.productId,
        quantity: 1,
        unit_sale_price: 30,
        discount_amount: 0,
        platform_fee: 0,
        shipping_cost: 0,
        additional_costs: 0,
      },
    ],
    p_idempotency_key: key(runId, "seed-sale"),
    p_customer_id: customer.id,
    p_notes: `__E2E__ ${runId}`,
    p_reserve: true,
    p_sales_channel: "IN_PERSON",
    p_delivery_method: "CUSTOMER_PICKUP",
  });
  const saleId = stringField(sale, "sale_id");

  await rpc(client, "deliver_business_sale", {
    p_sale_id: saleId,
    p_idempotency_key: key(runId, "seed-deliver"),
  });

  await rpc(client, "record_business_expense", {
    p_workspace_id: workspaceId,
    p_description: `__E2E__ Expense ${runId}`,
    p_category: "taxas",
    p_amount: 12.34,
    p_idempotency_key: key(runId, "seed-expense"),
    p_notes: `__E2E__ ${runId}`,
  });

  await rpc(client, "update_business_product_metadata", {
    p_workspace_id: workspaceId,
    p_product_id: purchase.productId,
    p_idempotency_key: key(runId, "seed-product-category"),
    p_name: `__E2E__ Base Product ${runId}`,
    p_sku: `E2E-BASE-${runId}`,
    p_default_sale_price: 30,
    p_minimum_stock: 1,
    p_active: true,
    p_category_id: null,
    p_category_name: `E2E Product Category ${runId}`,
  });

  return {
    workspaceId,
    productId: purchase.productId,
    purchaseOrderId: purchase.purchaseOrderId,
    purchaseItemId: purchase.purchaseItemId,
    saleId,
  };
}

async function assertLastUnitConcurrency(ctx: E2EContext) {
  const product = await createAndReceiveProduct(ctx.clientA, ctx.workspaceId, ctx.runId, "Last Unit", 1, 10, 25);
  const saleArgs = (suffix: string) => ({
    p_workspace_id: ctx.workspaceId,
    p_items: [
      {
        product_id: product.productId,
        quantity: 1,
        unit_sale_price: 25,
        discount_amount: 0,
        platform_fee: 0,
        shipping_cost: 0,
        additional_costs: 0,
      },
    ],
    p_idempotency_key: key(ctx.runId, `last-unit-${suffix}`),
    p_reserve: true,
    p_sales_channel: "IN_PERSON",
    p_delivery_method: "CUSTOMER_PICKUP",
  });

  const results = await Promise.allSettled([
    ctx.clientA.rpc("create_business_sale", saleArgs("a")),
    ctx.clientB.rpc("create_business_sale", saleArgs("b")),
  ]);
  const successful = results.filter((result) => result.status === "fulfilled" && !result.value.error);
  expect(successful.length, "Only one concurrent sale can reserve the last unit").toBe(1);

  const { data, error } = await ctx.admin
    .from("business_inventory_lots")
    .select("remaining_quantity,reserved_quantity")
    .eq("product_id", product.productId)
    .eq("user_id", ctx.userId);
  expect(error, error?.message).toBeNull();
  const reserved = (data ?? []).reduce((sum, row) => sum + Number(row.reserved_quantity), 0);
  const remaining = (data ?? []).reduce((sum, row) => sum + Number(row.remaining_quantity), 0);
  expect(reserved).toBeLessThanOrEqual(1);
  expect(remaining - reserved).toBeGreaterThanOrEqual(0);
}

async function assertSalePaymentConcurrency(ctx: E2EContext) {
  const product = await createAndReceiveProduct(ctx.clientA, ctx.workspaceId, ctx.runId, "Sale Payment", 2, 10, 100);
  const sale = await rpc<RpcJson>(ctx.clientA, "create_business_sale", {
    p_workspace_id: ctx.workspaceId,
    p_items: [{ product_id: product.productId, quantity: 1, unit_sale_price: 100 }],
    p_idempotency_key: key(ctx.runId, "sale-payment-sale"),
    p_reserve: true,
    p_sales_channel: "IN_PERSON",
    p_delivery_method: "CUSTOMER_PICKUP",
  });
  const saleId = stringField(sale, "sale_id");

  await Promise.allSettled([
    ctx.clientA.rpc("record_business_payment", {
      p_sale_id: saleId,
      p_amount: 70,
      p_idempotency_key: key(ctx.runId, "sale-payment-a"),
      p_payment_method: "pix",
      p_status: "PAID",
    }),
    ctx.clientB.rpc("record_business_payment", {
      p_sale_id: saleId,
      p_amount: 70,
      p_idempotency_key: key(ctx.runId, "sale-payment-b"),
      p_payment_method: "pix",
      p_status: "PAID",
    }),
  ]);

  const { data, error } = await ctx.admin
    .from("business_payments")
    .select("amount,status")
    .eq("sale_id", saleId)
    .eq("user_id", ctx.userId);
  expect(error, error?.message).toBeNull();
  const paid = (data ?? [])
    .filter((row) => row.status === "PAID")
    .reduce((sum, row) => sum + Number(row.amount), 0);
  expect(paid, "Concurrent sale payments cannot exceed sale total").toBeLessThanOrEqual(100);
}

async function assertPurchasePaymentConcurrency(ctx: E2EContext) {
  const product = await createAndReceiveProduct(ctx.clientA, ctx.workspaceId, ctx.runId, "Purchase Payment", 1, 100, 130);

  await Promise.allSettled([
    ctx.clientA.rpc("record_business_purchase_payment", {
      p_purchase_order_id: product.purchaseOrderId,
      p_amount: 70,
      p_idempotency_key: key(ctx.runId, "purchase-payment-a"),
      p_payment_method: "pix",
      p_status: "PAID",
    }),
    ctx.clientB.rpc("record_business_purchase_payment", {
      p_purchase_order_id: product.purchaseOrderId,
      p_amount: 70,
      p_idempotency_key: key(ctx.runId, "purchase-payment-b"),
      p_payment_method: "pix",
      p_status: "PAID",
    }),
  ]);

  const { data, error } = await ctx.admin
    .from("business_purchase_payments")
    .select("amount,status")
    .eq("purchase_order_id", product.purchaseOrderId)
    .eq("user_id", ctx.userId);
  expect(error, error?.message).toBeNull();
  const paid = (data ?? [])
    .filter((row) => row.status === "PAID")
    .reduce((sum, row) => sum + Number(row.amount), 0);
  expect(paid, "Concurrent purchase payments cannot exceed purchase total").toBeLessThanOrEqual(100);
}

async function assertDuplicateCategoryConcurrency(ctx: E2EContext) {
  const first = await createAndReceiveProduct(ctx.clientA, ctx.workspaceId, ctx.runId, "Category A", 1, 5, 10);
  const second = await createAndReceiveProduct(ctx.clientA, ctx.workspaceId, ctx.runId, "Category B", 1, 5, 10);
  const categoryName = `Concurrent Category ${ctx.runId}`;

  const updateArgs = (productId: string, suffix: string) => ({
    p_workspace_id: ctx.workspaceId,
    p_product_id: productId,
    p_idempotency_key: key(ctx.runId, `dup-category-${suffix}`),
    p_name: `__E2E__ ${suffix} ${ctx.runId}`,
    p_sku: `E2E-CAT-${suffix}-${ctx.runId}`,
    p_default_sale_price: 10,
    p_minimum_stock: 0,
    p_active: true,
    p_category_id: null,
    p_category_name: categoryName,
  });

  const results = await Promise.allSettled([
    ctx.clientA.rpc("update_business_product_metadata", updateArgs(first.productId, "a")),
    ctx.clientB.rpc("update_business_product_metadata", updateArgs(second.productId, "b")),
  ]);
  const errors = results.filter((result) => result.status === "fulfilled" && result.value.error);
  expect(errors.length, "Both products should resolve the same category without duplicate creation").toBe(0);

  const { data, error } = await ctx.admin
    .from("business_product_categories")
    .select("id")
    .eq("workspace_id", ctx.workspaceId)
    .eq("user_id", ctx.userId)
    .eq("normalized_name", categoryName.trim().toLowerCase());
  expect(error, error?.message).toBeNull();
  expect(data ?? []).toHaveLength(1);
}

async function assertDuplicateSkuConcurrency(ctx: E2EContext) {
  const first = await createAndReceiveProduct(ctx.clientA, ctx.workspaceId, ctx.runId, "SKU A", 1, 5, 10);
  const second = await createAndReceiveProduct(ctx.clientA, ctx.workspaceId, ctx.runId, "SKU B", 1, 5, 10);
  const sku = `E2E-DUP-SKU-${ctx.runId}`;

  const updateArgs = (productId: string, suffix: string) => ({
    p_workspace_id: ctx.workspaceId,
    p_product_id: productId,
    p_idempotency_key: key(ctx.runId, `dup-sku-${suffix}`),
    p_name: `__E2E__ SKU ${suffix} ${ctx.runId}`,
    p_sku: sku,
    p_default_sale_price: 10,
    p_minimum_stock: 0,
    p_active: true,
    p_category_id: null,
    p_category_name: null,
  });

  await Promise.allSettled([
    ctx.clientA.rpc("update_business_product_metadata", updateArgs(first.productId, "a")),
    ctx.clientB.rpc("update_business_product_metadata", updateArgs(second.productId, "b")),
  ]);

  const { data, error } = await ctx.admin
    .from("business_products")
    .select("id")
    .eq("workspace_id", ctx.workspaceId)
    .eq("user_id", ctx.userId)
    .eq("sku", sku);
  expect(error, error?.message).toBeNull();
  expect(data ?? []).toHaveLength(1);
}

async function createAndReceiveProduct(
  client: SupabaseClient,
  workspaceId: string,
  runId: string,
  label: string,
  quantity: number,
  unitCost: number,
  defaultSalePrice: number,
) {
  const safeLabel = label.replace(/[^a-z0-9]+/gi, "-").toUpperCase();
  const purchase = await rpc<RpcJson>(client, "create_business_purchase_multi", {
    p_workspace_id: workspaceId,
    p_items: [
      {
        product_name: `__E2E__ ${label} ${runId}`,
        product_sku: `E2E-${safeLabel}-${randomUUID().slice(0, 8)}-${runId}`,
        product_category_name: `E2E Seed Category ${runId}`,
        quantity,
        unit_purchase_cost: unitCost,
        default_sale_price: defaultSalePrice,
        minimum_stock: 0,
      },
    ],
    p_idempotency_key: key(runId, `purchase-${safeLabel}-${randomUUID()}`),
    p_notes: `__E2E__ ${runId}`,
  });
  const purchaseOrderId = stringField(purchase, "purchase_order_id");
  const firstItem = arrayField(purchase, "items")[0] as RpcJson;
  const purchaseItemId = stringField(firstItem, "purchase_item_id");
  const productId = stringField(firstItem, "product_id");

  await rpc(client, "receive_business_purchase_items", {
    p_purchase_order_id: purchaseOrderId,
    p_items: [{ purchase_item_id: purchaseItemId, quantity }],
    p_idempotency_key: key(runId, `receive-${safeLabel}-${randomUUID()}`),
  });

  return { purchaseOrderId, purchaseItemId, productId };
}

async function insertCustomer(client: SupabaseClient, workspaceId: string, name: string) {
  const { data: userData, error: userError } = await client.auth.getUser();
  expect(userError, userError?.message).toBeNull();
  const userId = userData.user?.id;
  expect(userId).toBeTruthy();

  const { data, error } = await client
    .from("business_customers")
    .insert({
      user_id: userId!,
      workspace_id: workspaceId,
      name,
      notes: "__E2E__ disposable",
    })
    .select("id")
    .single();
  expect(error, error?.message).toBeNull();
  return data as { id: string };
}

async function cleanupOldE2EUsers(admin: SupabaseClient) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    expect(error, error?.message).toBeNull();
    const users = data.users.filter((user) => user.email?.startsWith(e2eEmailPrefix));
    for (const user of users) {
      await cleanupUser(admin, user.id);
      await admin.auth.admin.deleteUser(user.id);
    }
    if (data.users.length < 100) break;
  }
}

async function cleanupUser(admin: SupabaseClient, userId: string) {
  for (const table of userOwnedTables) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error && error.code !== "42P01" && error.code !== "42703") {
      throw new Error(`Cleanup failed for ${table}: ${error.message}`);
    }
  }
}

async function signIn(client: SupabaseClient, email: string, password: string) {
  const { error } = await client.auth.signInWithPassword({ email, password });
  expect(error, error?.message).toBeNull();
}

async function rpc<T>(client: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  expect(error, error?.message).toBeNull();
  return data as T;
}

function makeClient(url: string, keyValue: string) {
  return createClient(url, keyValue, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

function loadEnv() {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  const files = [
    process.env.E2E_ENV_FILE,
    resolve(process.cwd(), ".env.local"),
    resolve(process.cwd(), ".env"),
  ].filter(Boolean) as string[];

  for (const filePath of files) {
    if (!existsSync(filePath)) continue;
    const lines = readFileSync(filePath, "utf8").replace(/\uFEFF/g, "").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const name = trimmed.slice(0, index).trim().replace(/[^\w]/g, "");
      const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
      if (name && !(name in env)) {
        env[name] = value;
      }
    }
  }
  return env;
}

function requireEnv(env: Record<string, string>, name: string) {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required E2E env: ${name}`);
  }
  return value;
}

function key(runId: string, suffix: string) {
  return `e2e:${runId}:${suffix}`;
}

function stringField(source: RpcJson, field: string) {
  const value = source[field];
  expect(typeof value, `Expected ${field} to be a string`).toBe("string");
  return value as string;
}

function arrayField(source: RpcJson, field: string) {
  const value = source[field];
  expect(Array.isArray(value), `Expected ${field} to be an array`).toBe(true);
  return value as unknown[];
}
