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
 * The one loud part, the push job's fail-closed "Require …" step, is pinned
 * too, because losing it is just as silent.
 * See DOCKER.md, "Server Actions encryption key".
 */
const KEY = "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY";
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/** The workflow split into the `verify` job and the `build-scan-and-push` job (the last one). */
function workflowJobs() {
  const wf = read(".github/workflows/docker-build-push.yml");
  const verify = wf.indexOf("\n  verify:");
  const push = wf.indexOf("\n  build-scan-and-push:");
  expect(verify).toBeGreaterThan(0);
  expect(push).toBeGreaterThan(verify);
  return { verifyJob: wf.slice(verify, push), pushJob: wf.slice(push) };
}

/** One step of a job, found by its exact `- name:`. */
function jobStep(job: string, name: string): string {
  const steps = job.split(/\n(?=\s*- name: )/);
  const matches = steps.filter((s) => s.trimStart().startsWith(`- name: ${name}\n`));
  expect(matches).toHaveLength(1);
  return matches[0];
}

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
    const { verifyJob, pushJob } = workflowJobs();
    // Neither a `secrets:` input on its image build nor any secrets.* expression.
    expect(verifyJob).not.toMatch(/^\s+secrets:/m);
    expect(verifyJob).not.toMatch(/\$\{\{\s*secrets\./);
    expect(jobStep(pushJob, "Build and push with SHA tag")).toMatch(
      /^ +secrets: \|\n +NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=\$\{\{ secrets\.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY \}\}$/m,
    );
  });

  it("build-scan-and-push refuses to build when the repository secret is missing", () => {
    // build-push-action only WARNS on an empty secret, and BuildKit leaves
    // secret values out of the cache key, so a keyless `npm run build` layer
    // would land in :buildcache and be reused by main's build of the same
    // tree. This step is the only thing that turns a missing secret into a
    // failed run. See DOCKER.md, "Server Actions encryption key".
    const { pushJob } = workflowJobs();
    const step = jobStep(pushJob, `Require ${KEY}`);
    // Dependabot runs cannot read Actions secrets; they must never reach it.
    expect(step).toMatch(/^\s*if: github\.actor != 'dependabot\[bot\]'$/m);
    expect(step).not.toMatch(/continue-on-error/);
    expect(step).toMatch(new RegExp(`^\\s*SA_KEY: \\$\\{\\{ secrets\\.${KEY} \\}\\}$`, "m"));
    const test = step.indexOf('if [ -z "$SA_KEY" ]; then');
    expect(test).toBeGreaterThan(-1);
    expect(step.indexOf("exit 1", test)).toBeGreaterThan(test);
    // Tests the value and never prints it: the -z test is its only use.
    expect(step.match(/\$\{?SA_KEY\b/g)).toHaveLength(1);
    expect(step).not.toMatch(/set -x|printenv/);
    // It must run before the build that would write the layer to the cache.
    expect(pushJob.indexOf(`- name: Require ${KEY}\n`)).toBeLessThan(
      pushJob.indexOf("- name: Build and push with SHA tag\n"),
    );
  });
});
