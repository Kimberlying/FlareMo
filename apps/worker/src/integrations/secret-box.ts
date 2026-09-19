import type { IntegrationId } from "@flaremo/domain";
import type { FlareMoEnv } from "../env";

/**
 * Generic secret envelope for instance integrations (email, OAuth). Same
 * scheme as the voice-service credentials: envelope v0 stores plaintext JSON
 * (D1 is encrypted at rest), v1 is AES-GCM ciphertext bound to a per-
 * integration AAD. A v1 envelope without the matching key fails closed.
 */

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

function aadFor(id: IntegrationId) {
  return ENCODER.encode(`flaremo:integration:${id}:v1`);
}

function hasEncryptionKey(secret: string | undefined): secret is string {
  return Boolean(secret && secret.length >= 32);
}

/** UI hint: whether saved integration secrets can be encrypted at rest. */
export function canEncryptIntegrationCredentials(secret: string | undefined) {
  return hasEncryptionKey(secret);
}

async function encryptionKey(secret: string) {
  const hash = await crypto.subtle.digest("SHA-256", ENCODER.encode(secret));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function sealIntegrationCredentials<T>(
  id: IntegrationId,
  secret: string | undefined,
  value: T,
): Promise<string> {
  if (!hasEncryptionKey(secret)) {
    return JSON.stringify({ v: 0, data: value });
  }
  const key = await encryptionKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aadFor(id) },
    key,
    ENCODER.encode(JSON.stringify(value)),
  );
  return JSON.stringify({
    v: 1,
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(ciphertext)),
  });
}

export async function openIntegrationCredentials<T>(
  id: IntegrationId,
  secret: string | undefined,
  envelope: string,
  parse: (value: unknown) => T,
): Promise<T> {
  const value = JSON.parse(envelope) as {
    v: number;
    data?: unknown;
    iv?: number[];
  } | null;
  if (value === null || typeof value !== "object") {
    throw new Error("Invalid integration envelope");
  }
  if (value.v === 0) return parse(value.data);
  if (value.v !== 1) throw new Error("Invalid integration envelope version");
  if (!hasEncryptionKey(secret)) {
    throw new Error("Integration encryption key unavailable");
  }
  const key = await encryptionKey(secret);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(value.iv ?? []),
      additionalData: aadFor(id),
    },
    key,
    new Uint8Array(value.data as number[]),
  );
  return parse(JSON.parse(DECODER.decode(plaintext)));
}

export function maskSecret(value: string | undefined | null) {
  if (!value) return "";
  if (value.length <= 4) return "****";
  return `****${value.slice(-4)}`;
}

/**
 * Key for sealing/unsealing integration credentials. Falls back to the voice
 * config key so deployments that already run one encryption key do not need a
 * second one; a dedicated key takes precedence.
 */
export function integrationEncryptionSecret(
  env: FlareMoEnv,
): string | undefined {
  return (
    env.FLAREMO_INTEGRATION_CONFIG_KEY?.trim() ||
    env.FLAREMO_VOICE_CONFIG_KEY?.trim() ||
    undefined
  );
}
