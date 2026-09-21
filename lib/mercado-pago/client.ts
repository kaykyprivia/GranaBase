import { MercadoPagoConfig, PreApproval, PreApprovalPlan, Payment } from "mercadopago";

/**
 * Retorna o ambiente ativo do Mercado Pago.
 * Lê a variavel MERCADO_PAGO_ENVIRONMENT do .env
 */
export function getMercadoPagoEnvironment(): "sandbox" | "production" {
  const env = process.env.MERCADO_PAGO_ENVIRONMENT;

  if (env === "production") return "production";
  if (env === "sandbox") return "sandbox";

  // Default: sandbox (mais seguro)
  return "sandbox";
}

/**
 * Retorna o access token correto baseado no ambiente.
 */
export function getMercadoPagoAccessToken(): string {
  const environment = getMercadoPagoEnvironment();

  const token =
    environment === "production"
      ? process.env.MERCADO_PAGO_ACCESS_TOKEN_PROD
      : process.env.MERCADO_PAGO_ACCESS_TOKEN_TEST;

  if (!token) {
    throw new Error(
      `MERCADO_PAGO_ACCESS_TOKEN_${environment === "production" ? "PROD" : "TEST"} nao configurado`
    );
  }

  return token;
}

/**
 * Retorna a public key correta baseada no ambiente.
 */
export function getMercadoPagoPublicKey(): string {
  const environment = getMercadoPagoEnvironment();

  const key =
    environment === "production"
      ? process.env.MERCADO_PAGO_PUBLIC_KEY_PROD
      : process.env.MERCADO_PAGO_PUBLIC_KEY_TEST;

  if (!key) {
    throw new Error(
      `MERCADO_PAGO_PUBLIC_KEY_${environment === "production" ? "PROD" : "TEST"} nao configurada`
    );
  }

  return key;
}

/**
 * Cria uma instancia configurada do SDK do Mercado Pago.
 * IMPORTANTE: sempre chama essa funcao dentro do backend (API Routes).
 * Nunca exponha o access token no frontend.
 */
export function getMercadoPagoClient() {
  const accessToken = getMercadoPagoAccessToken();

  return {
    config: new MercadoPagoConfig({ accessToken }),
    environment: getMercadoPagoEnvironment(),
  };
}

/**
 * Retorna instancias prontas dos recursos mais usados.
 */
export function getMercadoPagoResources() {
  const { config, environment } = getMercadoPagoClient();

  return {
    environment,
    preApproval: new PreApproval(config),
    preApprovalPlan: new PreApprovalPlan(config),
    payment: new Payment(config),
  };
}
