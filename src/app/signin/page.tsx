import { connection } from "next/server";

import { SignIn } from "@/components/sign-in/sign-in";

/**
 * `instant = false` lets this route BLOCK rather than serve a prerendered
 * shell — which is what `connection()` needs under cacheComponents, and what
 * a nonce needs in order to exist at render time. Without it the build fails
 * with "uncached or runtime data during prerendering".
 */
export const instant = false;

/**
 * Opt out of prerendering.
 *
 * NOT `export const dynamic = "force-dynamic"` — Next 16 rejects that
 * outright when `cacheComponents` is enabled ("Route segment config
 * \"dynamic\" is not compatible with nextConfig.cacheComponents"), which is
 * upstream MPNext's documented fix and does not apply to this config.
 * `connection()` is the supported way to defer a route to request time here,
 * and is the pattern already used elsewhere in this repo (see
 * .claude/rules/caching.md).
 *
 * Why it matters: Next reads the CSP nonce off the INCOMING REQUEST, so a
 * prerendered page has no nonce, its bootstrap script is blocked under an
 * enforced policy, and it never hydrates. /signin does nothing BUT run
 * client-side effects to start the Ministry Platform OAuth flow, so an
 * unhydrated /signin is a permanent spinner that never reaches MP — on the
 * one page nobody can route around.
 *
 * This file must also stay a SERVER component: the page body lives in
 * `@/components/sign-in/sign-in` because route-level opt-outs are ignored in
 * a `"use client"` module. `page.test.tsx` pins both halves.
 */
export default async function SignInPage() {
  await connection();
  return <SignIn />;
}
