import crypto from "node:crypto";

/**
 * Valida a assinatura de um webhook do Mercado Pago.
 *
 * O MP envia o header `x-signature` no formato:
 *   ts=<timestamp>,v1=<hmac>
 *
 * E o header `x-request-id` com um UUID do request.
 *
 * O manifest a ser assinado e:
 *   id:<resource_id>;request-id:<x_request_id>;ts:<ts>;
 *
 * Referencia: https://www.mercadopago.com.br/developers/en/docs/your-integrations/notifications/webhooks
 */
export function verifyMPWebhookSignature(params: {
  signatureHeader: string | null;
  requestIdHeader: string | null;
  resourceId: string | null;
  secret: string | null;
}): { valid: boolean; reason?: string } {
  const { signatureHeader, requestIdHeader, resourceId, secret } = params;

  if (!secret) {
    return { valid: false, reason: "missing_secret" };
  }

  if (!signatureHeader) {
    return { valid: false, reason: "missing_signature_header" };
  }

  if (!resourceId) {
    return { valid: false, reason: "missing_resource_id" };
  }

  // Parse do header: "ts=1234,v1=abcdef"
  const parts = signatureHeader.split(",");
  let ts: string | null = null;
  let v1: string | null = null;

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "ts") ts = value ?? null;
    if (key === "v1") v1 = value ?? null;
  }

  if (!ts || !v1) {
    return { valid: false, reason: "malformed_signature_header" };
  }

  const requestId = requestIdHeader ?? "";

  // Manifest conforme doc do MP
  const manifest = `id:${resourceId};request-id:${requestId};ts:${ts};`;

  const hmac = crypto
    .createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  const expected = Buffer.from(hmac, "utf8");
  const received = Buffer.from(v1, "utf8");

  if (expected.length !== received.length) {
    return { valid: false, reason: "signature_length_mismatch" };
  }

  const ok = crypto.timingSafeEqual(expected, received);

  return ok ? { valid: true } : { valid: false, reason: "signature_mismatch" };
}
