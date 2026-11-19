import { getMpBaseUrl } from "@/lib/env";
import { causeForLog } from "@/lib/log-safe";
import { MP_TOKEN_TIMEOUT_MS } from "../utils/timeouts";

/**
 * Shape of the OAuth2 client-credentials token response returned by the
 * Ministry Platform `/oauth/connect/token` endpoint.
 *
 * `expires_in` is the token's lifetime in seconds. It is optional here because
 * the endpoint's response is untrusted at the type level — callers must handle
 * it being absent or non-numeric.
 */
export interface ClientCredentialsToken {
  access_token: string;
  /** Not required: MP's response has not been confirmed to always carry it. */
  token_type?: string;
  expires_in?: number;
}

const ERROR_PREFIX = "Failed to get client credentials token";

/** Visible ASCII only (0x21-0x7E): no space, control character or non-ASCII. */
const HEADER_SAFE_TOKEN = /^[\x21-\x7E]+$/;

/**
 * A caught error's class name only (`TypeError`, `TimeoutError`, ...), never its
 * message. Duck-typed because `AbortSignal.timeout` rejects with a DOMException.
 */
function errorName(error: unknown): string {
  const name =
    typeof error === "object" && error !== null ? (error as { name?: unknown }).name : undefined;
  return typeof name === "string" && /^[A-Za-z]{1,64}$/.test(name) ? name : typeof error;
}

/**
 * Every thrown message here is fixed text plus at most an error class name or an
 * HTTP status: never the response body, the client secret or the token.
 */
export async function getClientCredentialsToken(): Promise<ClientCredentialsToken> {
  // Validated (https, no credentials/query, no trailing slash; src/lib/env.ts):
  // this request carries the client secret. Throws before any fetch.
  const mpBaseUrl = getMpBaseUrl();
  const mpOauthUrl = `${mpBaseUrl}/oauth`;

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.MINISTRY_PLATFORM_CLIENT_ID!,
    client_secret: process.env.MINISTRY_PLATFORM_CLIENT_SECRET!,
    scope: "http://www.thinkministry.com/dataplatform/scopes/all",
  });

  let response: Response;
  try {
    response = await fetch(`${mpOauthUrl}/connect/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      // A followed 307/308 would re-send this form body, client_secret
      // included, to whatever origin it names. MP's token endpoint never
      // redirects (audit N12, upstream MPNext 5aa0b5e).
      redirect: "error",
      signal: AbortSignal.timeout(MP_TOKEN_TIMEOUT_MS),
    });
  } catch (error) {
    // Plus the cause's class and code (never its message), so a network failure
    // still says ECONNREFUSED, a connect timeout or a refused redirect.
    throw new Error(`${ERROR_PREFIX}: ${errorName(error)}${causeForLog(error)}`);
  }

  if (!response.ok) {
    // Status first: statusText is empty over HTTP/2. Never the body.
    throw new Error(`${ERROR_PREFIX}: ${response.status} ${response.statusText ?? ""}`.trimEnd());
  }

  let token: unknown;
  try {
    token = await response.json();
  } catch {
    // V8's SyntaxError quotes part of the body.
    throw new Error(`${ERROR_PREFIX}: invalid JSON response`);
  }

  // A 200 without a usable access token used to be cached for 55 minutes and
  // sent as "Authorization: Bearer undefined" on every MP call. The token must
  // also be header-safe (visible ASCII, no spaces): it goes into
  // `Authorization: Bearer <token>`, and undici's "invalid header value"
  // TypeError quotes the whole header, so a NUL or CR/LF in it would put the
  // token into every logged fetch error.
  const candidate = token as Partial<Record<keyof ClientCredentialsToken, unknown>> | null;
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    typeof candidate.access_token !== "string" ||
    !HEADER_SAFE_TOKEN.test(candidate.access_token)
  ) {
    throw new Error(`${ERROR_PREFIX}: invalid token response`);
  }
  // token_type may be absent; when present it must be bearer (any case).
  const tokenType = candidate.token_type;
  if (
    tokenType !== undefined &&
    tokenType !== null &&
    (typeof tokenType !== "string" || tokenType.toLowerCase() !== "bearer")
  ) {
    throw new Error(`${ERROR_PREFIX}: unsupported token type`);
  }

  return candidate as ClientCredentialsToken;
}
