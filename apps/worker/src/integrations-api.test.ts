import { applyFlaremoMigrations, createDb } from "@flaremo/db";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import app from "./index";
import {
  openIntegrationCredentials,
  sealIntegrationCredentials,
} from "./integrations/secret-box";

let mf: Miniflare;
let env: Env;
let sessionCookie: string;

const TEST_AUTH_SECRET =
  "test-better-auth-secret-that-is-never-used-in-production";
const TEST_BOOTSTRAP_SECRET =
  "test-bootstrap-secret-that-is-never-used-in-production";
const TEST_PASSWORD = "test-password-not-for-production-123";
const TEST_ENCRYPTION_KEY = "test-integration-encryption-key-32-chars!!";

describe("instance integration settings (email, OAuth)", () => {
  beforeEach(async () => {
    mf = new Miniflare({
      script: "export default { fetch() { return new Response('ok') } }",
      modules: true,
      compatibilityDate: "2026-07-10",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: "flaremo-integrations-test" },
    });
    const db = await mf.getD1Database("DB");
    env = {
      DB: db,
      ASSETS: {
        fetch: async () => new Response("asset", { status: 200 }),
      } as Fetcher,
      FLAREMO_PUBLIC_URL: "http://flaremo.test",
      BETTER_AUTH_SECRET: TEST_AUTH_SECRET,
      FLAREMO_BOOTSTRAP_SECRET: TEST_BOOTSTRAP_SECRET,
      FLAREMO_INTEGRATION_CONFIG_KEY: TEST_ENCRYPTION_KEY,
    } as Env;
    await applyFlaremoMigrations(db);
    sessionCookie = await bootstrapAndSignIn();
  });

  async function bootstrapAndSignIn() {
    const setup = await app.fetch(
      new Request("http://flaremo.test/api/auth/flaremo/bootstrap", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-flaremo-bootstrap-secret": TEST_BOOTSTRAP_SECRET,
          origin: "http://flaremo.test",
        },
        body: JSON.stringify({
          username: "owner",
          name: "Owner",
          email: "owner@example.com",
          password: TEST_PASSWORD,
        }),
      }),
      env,
    );
    expect(setup.status).toBe(201);
    const signIn = await app.fetch(
      new Request("http://flaremo.test/api/auth/sign-in/username", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://flaremo.test",
        },
        body: JSON.stringify({
          username: "owner",
          password: TEST_PASSWORD,
        }),
      }),
      env,
    );
    expect(signIn.status).toBe(200);
    const headers = signIn.headers as Headers & {
      getSetCookie?: () => string[];
    };
    const setCookies = headers.getSetCookie?.() ?? [
      signIn.headers.get("set-cookie"),
    ];
    const cookies = setCookies
      .filter((value): value is string => Boolean(value))
      .map((value) => value.split(";", 1)[0] ?? "")
      .filter(Boolean);
    expect(cookies.length).toBeGreaterThan(0);
    return cookies.join("; ");
  }

  afterEach(async () => {
    await mf.dispose();
  });

  const request = (
    path: string,
    method: string,
    body?: unknown,
    cookie = sessionCookie,
    origin = "http://flaremo.test",
  ) =>
    app.fetch(
      new Request(`http://flaremo.test${path}`, {
        method,
        headers: { cookie, origin, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
    );

  it("saves Resend credentials encrypted, masks them, and gates the API to the owner", async () => {
    expect(
      (await request("/api/app/admin/email-settings", "GET", undefined, ""))
        .status,
    ).toBe(401);
    expect(
      (
        await request("/api/app/admin/email-settings", "PUT", {
          revision: null,
          enabled: true,
          credentials: {
            apiKey: "",
            from: "no-reply@example.com",
            fromName: "",
          },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          "/api/app/admin/email-settings",
          "PUT",
          {
            revision: null,
            enabled: true,
            credentials: {
              apiKey: "re_test-secret",
              from: "no-reply@example.com",
              fromName: "FlareMo",
            },
          },
          sessionCookie,
          "https://evil.test",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request("/api/app/admin/email-settings", "PUT", {
          revision: null,
          enabled: true,
          credentials: {
            apiKey: "re_test-secret",
            from: "no-reply@example.com",
            fromName: "FlareMo",
          },
        })
      ).status,
    ).toBe(200);

    const state = (await (
      await request("/api/app/admin/email-settings", "GET")
    ).json()) as {
      revision: string;
      source: string;
      provider: string;
      from: string;
      configured: boolean;
      encrypted: boolean;
      previews: { apiKey: string };
    };
    expect(state.source).toBe("database");
    expect(state.provider).toBe("resend");
    expect(state.from).toBe("no-reply@example.com");
    expect(state.configured).toBe(true);
    expect(state.encrypted).toBe(true);
    expect(state.previews.apiKey).toBe("****cret");
    // Envelope v1 under the configured encryption key.
    const stored = await env.DB.prepare(
      "SELECT ciphertext FROM integration_config WHERE id = 'email'",
    ).first<{ ciphertext: string }>();
    const opened = await openIntegrationCredentials(
      "email",
      TEST_ENCRYPTION_KEY,
      stored?.ciphertext ?? "",
      (value) => value,
    );
    expect((opened as { apiKey: string }).apiKey).toBe("re_test-secret");
  });

  it("resolves email config from the database for the effective send path", async () => {
    await request("/api/app/admin/email-settings", "PUT", {
      revision: null,
      enabled: true,
      credentials: {
        apiKey: "re_test-secret",
        from: "no-reply@example.com",
        fromName: "",
      },
    });
    const db = createDb(env.DB);
    const { resolveEmailIntegration } = await import("./integrations/config");
    const resolved = await resolveEmailIntegration(env, db);
    expect(resolved.source).toBe("database");
    expect(resolved.provider).toBe("resend");
    expect(resolved.from).toBe("no-reply@example.com");
    // Env wins when it fully configures a provider.
    const envApp = await app.fetch(
      new Request("http://flaremo.test/api/app/admin/email-settings", {
        headers: { cookie: sessionCookie, origin: "http://flaremo.test" },
      }),
      {
        ...env,
        FLAREMO_EMAIL_PROVIDER: "cloudflare",
        FLAREMO_EMAIL_FROM: "env@example.com",
      },
    );
    const envState = (await envApp.json()) as {
      source: string;
      provider: string;
    };
    expect(envState.source).toBe("environment");
    expect(envState.provider).toBe("cloudflare");
  });

  it("stores OAuth providers, exposes ids publicly, and deletes cleanly", async () => {
    expect(
      (
        await request("/api/app/admin/oauth-settings", "PUT", {
          revision: null,
          credentials: {
            google: { clientId: "", clientSecret: "" },
            github: { clientId: "", clientSecret: "" },
          },
        })
      ).status,
    ).toBe(400);

    expect(
      (
        await request("/api/app/admin/oauth-settings", "PUT", {
          revision: null,
          credentials: {
            google: { clientId: "g-id", clientSecret: "g-secret" },
            github: { clientId: "gh-id", clientSecret: "gh-secret" },
          },
        })
      ).status,
    ).toBe(200);

    const providers = (await (
      await request("/api/app/auth-providers", "GET", undefined, "")
    ).json()) as { google: boolean; github: boolean };
    expect(providers.google).toBe(true);
    expect(providers.github).toBe(true);

    // Sealed, not plaintext, in D1.
    const stored = await env.DB.prepare(
      "SELECT ciphertext FROM integration_config WHERE id = 'oauth'",
    ).first<{ ciphertext: string }>();
    expect(stored?.ciphertext ?? "").not.toContain("g-secret");
    const opened = await openIntegrationCredentials(
      "oauth",
      TEST_ENCRYPTION_KEY,
      stored?.ciphertext ?? "",
      (value) => value,
    );
    expect(
      (opened as { github?: { clientSecret: string } }).github?.clientSecret,
    ).toBe("gh-secret");

    const get = (await (
      await request("/api/app/admin/oauth-settings", "GET")
    ).json()) as {
      revision: string;
      previews: {
        google: { clientSecret: string };
        github: { clientId: string };
      };
    };
    expect(get.previews.google.clientSecret).toBe("****cret");
    expect(get.previews.github.clientId).toBe("gh-id");

    expect(
      (
        await request("/api/app/admin/oauth-settings", "DELETE", {
          revision: get.revision,
        })
      ).status,
    ).toBe(200);
    const afterDelete = (await (
      await request("/api/app/auth-providers", "GET", undefined, "")
    ).json()) as { google: boolean; github: boolean };
    expect(afterDelete.google).toBe(false);
    expect(afterDelete.github).toBe(false);
  });

  it("lets environment variables drive providers when nothing is saved", async () => {
    const providers = (await (
      await app.fetch(
        new Request("http://flaremo.test/api/app/auth-providers"),
        {
          ...env,
          FLAREMO_OAUTH_GOOGLE_CLIENT_ID: "env-g-id",
          FLAREMO_OAUTH_GOOGLE_CLIENT_SECRET: "env-g-secret",
        },
      )
    ).json()) as { google: boolean; github: boolean };
    expect(providers.google).toBe(true);
    expect(providers.github).toBe(false);
  });

  it("starts the social sign-in round trip from env-provided providers", async () => {
    const response = await app.fetch(
      new Request("http://flaremo.test/api/auth/sign-in/social", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://flaremo.test",
        },
        body: JSON.stringify({ provider: "github", callbackURL: "/" }),
      }),
      {
        ...env,
        FLAREMO_OAUTH_GITHUB_CLIENT_ID: "gh-id",
        FLAREMO_OAUTH_GITHUB_CLIENT_SECRET: "gh-secret",
      },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { redirect: boolean; url: string };
    expect(body.redirect).toBe(true);
    expect(body.url).toContain("github.com/login/oauth/authorize");
    expect(body.url).toContain("client_id=gh-id");
  });

  it("seal/open round-trips without a key as a v0 envelope", async () => {
    const envelope = await sealIntegrationCredentials("oauth", undefined, {
      marker: "plain",
    });
    expect(envelope.startsWith('{"v":0')).toBe(true);
    const opened = await openIntegrationCredentials(
      "oauth",
      undefined,
      envelope,
      (value) => value,
    );
    expect(opened).toEqual({ marker: "plain" });
  });
});
