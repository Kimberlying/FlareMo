import { stripResourceName } from "@/lib/utils";
import { apiRequest } from "./client";
import type {
  Article,
  ArticleSummary,
  CreateArticleRequest,
  UpdateArticleRequest,
} from "./types";

// --- Articles ---------------------------------------------------------------

/**
 * Requests carry the bare uuid: the namespaced form's slash would land in the
 * URL as `%2F` and browsers/routers have divergent normalization behavior for
 * it. The server resolves bare ids to the namespaced form itself.
 */
function articleApiId(id: string): string {
  return encodeURIComponent(stripResourceName(id, "articles"));
}

export async function listArticles(
  params: { status?: Article["status"]; include_deleted?: boolean } = {},
) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.include_deleted) query.set("include_deleted", "true");
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest<{ articles: ArticleSummary[] }>(
    `/api/app/articles${suffix}`,
  );
}

export async function createArticle(input: CreateArticleRequest) {
  return apiRequest<{ article: Article }>("/api/app/articles", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getArticle(id: string) {
  return apiRequest<{ article: Article }>(
    `/api/app/articles/${articleApiId(id)}`,
  );
}

export async function updateArticle(id: string, input: UpdateArticleRequest) {
  return apiRequest<{ article: Article }>(
    `/api/app/articles/${articleApiId(id)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export async function publishArticle(id: string, slug?: string) {
  return apiRequest<{ article: Article }>(
    `/api/app/articles/${articleApiId(id)}/publish`,
    { method: "POST", body: JSON.stringify(slug ? { slug } : {}) },
  );
}

export async function unpublishArticle(id: string) {
  return apiRequest<{ article: Article }>(
    `/api/app/articles/${articleApiId(id)}/unpublish`,
    { method: "POST" },
  );
}

export async function deleteArticle(id: string) {
  return apiRequest<{ article: Article }>(
    `/api/app/articles/${articleApiId(id)}`,
    {
      method: "DELETE",
    },
  );
}

export async function restoreArticle(id: string) {
  return apiRequest<{ article: Article }>(
    `/api/app/articles/${articleApiId(id)}/restore`,
    { method: "POST" },
  );
}
