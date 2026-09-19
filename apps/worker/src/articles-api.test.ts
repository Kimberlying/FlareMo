import { applyFlaremoMigrations } from "@flaremo/db";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import app from "./index";

/**
 * End-to-end HTTP flow for the articles API through the real worker app:
 * create (empty-title draft) → autosave PATCH → publish → public SSR page →
 * unpublish → recycle bin → restore. This is the integration path the UI's
 * list/editor/publish pages drive; the domain suite covers the semantics.
 */

let mf: Miniflare;
let env: Env;
let sessionCookie: string;

const TEST_AUTH_SECRET =
  "test-better-auth-secret-that-is-never-used-in-production";
const TEST_BOOTSTRAP_SECRET =
  "test-bootstrap-secret-that-is-never-used-in-production";
const TEST_PASSWORD = "test-password-not-for-production-123";

describe("Articles API end-to-end", () => {
  beforeEach(async () => {
    mf = new Miniflare({
      script: "export default { fetch() { return new Response('ok') } }",
      modules: true,
      compatibilityDate: "2026-07-10",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: "flaremo-articles-api-test" },
      r2Buckets: { ATTACHMENTS: "flaremo-articles-api-attachments" },
    });

    const db = await mf.getD1Database("DB");
    const r2 = await mf.getR2Bucket("ATTACHMENTS");
    env = {
      DB: db,
      ATTACHMENTS: r2,
      ASSETS: {
        fetch: async () =>
          new Response("<!doctype html><title>FlareMo</title>", {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          }),
      } as Fetcher,
      FLAREMO_SINGLE_USER_EMAIL: "owner@example.com",
      FLAREMO_SINGLE_USER_NAME: "Owner",
      FLAREMO_PUBLIC_URL: "http://flaremo.test",
      BETTER_AUTH_SECRET: TEST_AUTH_SECRET,
      FLAREMO_BOOTSTRAP_SECRET: TEST_BOOTSTRAP_SECRET,
    } as Env;

    await applyFlaremoMigrations(db);
    sessionCookie = await bootstrapAndSignIn();
  });

  afterEach(async () => {
    await mf.dispose();
  });

  const api = (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    headers.set("cookie", sessionCookie);
    if (!["GET", "HEAD"].includes((init.method ?? "GET").toUpperCase())) {
      headers.set("origin", "http://flaremo.test");
    }
    return app.fetch(
      new Request(`http://flaremo.test${path}`, { ...init, headers }),
      env,
    );
  };

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
        body: JSON.stringify({ username: "owner", password: TEST_PASSWORD }),
      }),
      env,
    );
    expect(signIn.status).toBe(200);
    const headers = signIn.headers as Headers & {
      getSetCookie?: () => string[];
    };
    const cookies = (
      headers.getSetCookie?.() ?? [signIn.headers.get("set-cookie")]
    )
      .filter((value): value is string => Boolean(value))
      .map((value) => value.split(";", 1)[0] ?? "");
    expect(cookies.length).toBeGreaterThan(0);
    return cookies.join("; ");
  }

  it("walks create → autosave → publish → public read → unpublish → trash → restore", async () => {
    // The list page's "new article" posts an empty body/title; that must be
    // accepted (drafts are untitled by design).
    const created = await api("/api/app/articles", {
      method: "POST",
      body: JSON.stringify({ title: "" }),
    });
    expect(created.status).toBe(201);
    const { article } = (await created.json()) as {
      article: { id: string; slug: string; title: string; status: string };
    };
    expect(article.status).toBe("draft");
    expect(article.title).toBe("");
    expect(article.slug).toMatch(/^article-[0-9a-f]{8}$/);

    // Autosave PATCH with title + content.
    const saved = await api(
      `/api/app/articles/${encodeURIComponent(article.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          title: "上线验收文",
          content: "# 标题\n\n正文段落。",
        }),
      },
    );
    expect(saved.status).toBe(200);
    const savedArticle = (
      (await saved.json()) as {
        article: { slug: string; title: string };
      }
    ).article;
    expect(savedArticle.title).toBe("上线验收文");

    // Draft pages are noindex 404s.
    const draftPage = await app.fetch(
      new Request(`http://flaremo.test/article/${savedArticle.slug}`),
      env,
    );
    expect(draftPage.status).toBe(404);

    // Publish (submit the autosaved slug back, as the dialog does).
    const published = await api(
      `/api/app/articles/${encodeURIComponent(article.id)}/publish`,
      {
        method: "POST",
        body: JSON.stringify({ slug: savedArticle.slug }),
      },
    );
    expect(published.status).toBe(200);
    const publishedArticle = (
      (await published.json()) as {
        article: { slug: string; status: string; published_at: string | null };
      }
    ).article;
    expect(publishedArticle.status).toBe("published");
    expect(publishedArticle.published_at).not.toBeNull();

    // The public SSR page answers 200 with the article body.
    const page = await app.fetch(
      new Request(
        `http://flaremo.test/article/${encodeURIComponent(publishedArticle.slug)}`,
      ),
      env,
    );
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("上线验收文");
    expect(html).toContain('"@type":"BlogPosting"');

    // It is enumerable: sitemap + feed include it.
    const sitemap = await app.fetch(
      new Request("http://flaremo.test/sitemap-articles.xml"),
      env,
    );
    expect(await sitemap.text()).toContain(
      `/article/${publishedArticle.slug}</loc>`,
    );
    const feed = await app.fetch(
      new Request("http://flaremo.test/feed.xml"),
      env,
    );
    expect(await feed.text()).toContain("上线验收文");

    // A malformed publish body is surfaced, not silently ignored.
    const badPublish = await api(
      `/api/app/articles/${encodeURIComponent(article.id)}/unpublish`,
      { method: "POST" },
    );
    expect(badPublish.status).toBe(200); // unpublish first: 200 back to draft

    // Unpublished: public page 404s again.
    const afterUnpublish = await app.fetch(
      new Request(`http://flaremo.test/article/${publishedArticle.slug}`),
      env,
    );
    expect(afterUnpublish.status).toBe(404);

    // Soft delete → hidden by default, visible with include_deleted=true.
    const deleted = await api(
      `/api/app/articles/${encodeURIComponent(article.id)}`,
      { method: "DELETE" },
    );
    expect(deleted.status).toBe(200);

    const liveList = await api("/api/app/articles");
    const liveBody = (await liveList.json()) as { articles: unknown[] };
    expect(liveBody.articles).toHaveLength(0);

    const binList = await api("/api/app/articles?include_deleted=true");
    const binBody = (await binList.json()) as { articles: unknown[] };
    expect(binBody.articles).toHaveLength(1);

    // The string "false" must not read as true (the old coerce.boolean bug).
    const falseList = await api("/api/app/articles?include_deleted=false");
    const falseBody = (await falseList.json()) as { articles: unknown[] };
    expect(falseBody.articles).toHaveLength(0);

    // Restore.
    const restored = await api(
      `/api/app/articles/${encodeURIComponent(article.id)}/restore`,
      { method: "POST" },
    );
    expect(restored.status).toBe(200);
    const restoredList = await api("/api/app/articles");
    expect(
      ((await restoredList.json()) as { articles: unknown[] }).articles,
    ).toHaveLength(1);
  });

  it("rejects unauthenticated access and malformed publish slugs", async () => {
    const anonymous = await app.fetch(
      new Request("http://flaremo.test/api/app/articles"),
      env,
    );
    expect(anonymous.status).toBe(401);

    const created = await api("/api/app/articles", {
      method: "POST",
      body: JSON.stringify({ title: "Slug guard", content: "c" }),
    });
    const { article } = (await created.json()) as { article: { id: string } };

    const taken = await api(
      `/api/app/articles/${encodeURIComponent(article.id)}/publish`,
      { method: "POST", body: JSON.stringify({ slug: "Not A Slug!" }) },
    );
    expect(taken.status).toBe(400);
    const body = (await taken.json()) as { error: { message: string } };
    expect(body.error.message).toContain("lowercase");
  });
});
