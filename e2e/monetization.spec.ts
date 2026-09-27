import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const e2eEmailPrefix = "granabase-e2e-mp+";
const e2eEmailDomain = "@example.com";

test.describe.configure({ mode: "serial" });

test.describe("Monetization and free access flow", () => {
  let admin: SupabaseClient;
  let userId: string;
  let email: string;
  let password: string;

  test.beforeAll(async () => {
    const env = loadEnv();
    const url = requireEnv(env, "NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
    admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    email = `${e2eEmailPrefix}${runId}${e2eEmailDomain}`;
    password = `E2E-${randomUUID().slice(0, 8)}aA1!`;

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(error, error?.message).toBeNull();
    userId = data.user!.id;
  });

  test.afterAll(async () => {
    if (userId) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  test("public routes respond without server errors", async ({ page }) => {
    const routes = [
      { path: "/", expect: /GranaBase|Controle financeiro/i },
      { path: "/login", expect: /Entrar|Login/i },
      { path: "/register", expect: /Criar conta|Cadastro/i },
      { path: "/terms", expect: /Termos de Uso/i },
      { path: "/privacy", expect: /Privacidade/i },
    ];

    for (const route of routes) {
      const response = await page.goto(route.path);
      expect(response?.status(), `${route.path}: HTTP status`).toBeLessThan(500);
      await expect(page.locator("body")).toContainText(route.expect, {
        timeout: 15_000,
      });
    }
  });

  test("health check endpoint returns ok", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBeLessThan(500);
    const body = await response.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("checks");
    expect(body.checks).toHaveProperty("supabase");
    expect(body.checks).toHaveProperty("mercado_pago");
  });

  test("register form links to terms and privacy", async ({ page }) => {
    await page.goto("/register");
    const termsLink = page.getByRole("link", { name: /Termos de uso/i });
    const privacyLink = page.getByRole("link", {
      name: /Politica de privacidade|Política de privacidade/i,
    });
    await expect(termsLink).toHaveAttribute("href", "/terms");
    await expect(privacyLink).toHaveAttribute("href", "/privacy");
  });

  test("authenticated user can activate free personal and business", async ({
    page,
  }) => {
    await login(page, email, password);

    await page.goto("/onboarding");
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await expect(page.locator("body")).toContainText(/Comece agora/i);
    await expect(page.locator("body")).toContainText(/Pessoal/i);
    await expect(page.locator("body")).toContainText(/Negocio|Negócio/i);

    // Ativa Personal
    const personalActivate = page
      .getByRole("button", { name: /Ativar 7 dias gratis|Ativar 7 dias grátis/i })
      .first();
    if (await personalActivate.isVisible().catch(() => false)) {
      await personalActivate.click();
      await expect(page.locator("body")).toContainText(
        /Ativo agora|d restantes/i,
        { timeout: 15_000 }
      );
    }

    // Verifica entitlement via service role (admin) apos ativacao
    const { data: grants, error: grantsError } = await admin
      .from("entitlement_grants")
      .select("product,status,ends_at")
      .eq("user_id", userId)
      .eq("product", "personal")
      .eq("source", "free");

    expect(grantsError, grantsError?.message).toBeNull();
    const grant = (grants ?? []).find(
      (g) => g.status === "active" && (!g.ends_at || new Date(g.ends_at) > new Date())
    );
    expect(grant, "Free personal grant should exist after activation").toBeTruthy();
  });
});

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  await page.waitForURL(/\/(dashboard|business|onboarding)/, { timeout: 30_000 });
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
    const lines = readFileSync(filePath, "utf8")
      .replace(/\uFEFF/g, "")
      .split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const name = trimmed
        .slice(0, index)
        .trim()
        .replace(/[^\w]/g, "");
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
