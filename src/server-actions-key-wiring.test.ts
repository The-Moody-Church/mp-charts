import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * NEXT_SERVER_ACTIONS_ENCRYPTION_KEY wiring (Dockerfile + CI).
 *
 * Next derives every Server Action ID from this key at build time. Without a
 * stable key each build renames every action, and a tab opened before a deploy
 * fails its next one, sign-out included, with "Failed to find Server Action".
 *
 * Both halves fail SILENTLY: if the Dockerfile stops reading the secret, or
 * the push job stops passing it, the image still builds (Next falls back to a
 * throwaway key) and nothing else in CI notices. Hence these source checks,
 * in the same spirit as the check:shells wiring test in src/app/layout.test.tsx.
 * See DOCKER.md, "Server Actions encryption key".
 */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("Server Actions encryption key wiring", () => {
  it("Dockerfile builder reads it as an optional BuildKit secret, never ARG/ENV", () => {
    const df = read("Dockerfile");
    // The mount, the existence check, the export from the secret file, then
    // the build, all in ONE RUN so the exported value reaches `next build`.
    expect(df).toMatch(
      /RUN --mount=type=secret,id=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY \\\n\s+if \[ -f \/run\/secrets\/NEXT_SERVER_ACTIONS_ENCRYPTION_KEY \]; then \\\n\s+export NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="\$\(cat \/run\/secrets\/NEXT_SERVER_ACTIONS_ENCRYPTION_KEY\)"; \\\n\s+fi; \\\n\s+npm run build$/m,
    );
    // ARG/ENV would put the key in `docker history` / the image config.
    expect(df).not.toMatch(/^\s*(ARG|ENV)\s+NEXT_SERVER_ACTIONS_ENCRYPTION_KEY/m);
    // Optional on purpose: verify and Dependabot builds have no secret.
    expect(df).not.toMatch(/required=true/);
  });

  it("only build-scan-and-push passes it; verify (runs for Dependabot) stays secret-free", () => {
    const wf = read(".github/workflows/docker-build-push.yml");
    const verify = wf.indexOf("\n  verify:");
    const push = wf.indexOf("\n  build-scan-and-push:");
    expect(verify).toBeGreaterThan(0);
    expect(push).toBeGreaterThan(verify);
    const verifyJob = wf.slice(verify, push);
    // Neither a `secrets:` input on its image build nor any secrets.* expression.
    expect(verifyJob).not.toMatch(/^\s+secrets:/m);
    expect(verifyJob).not.toMatch(/\$\{\{\s*secrets\./);
    expect(wf.slice(push)).toMatch(
      /^ +secrets: \|\n +NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=\$\{\{ secrets\.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY \}\}$/m,
    );
  });
});
