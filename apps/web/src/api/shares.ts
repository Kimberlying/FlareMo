import { apiRequest } from "./client";
import type { PublicShare, Share } from "./types";

export async function createShare(memo: string) {
  return apiRequest<Share>(`/api/v1/memos/${encodeURIComponent(memo)}/shares`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function listShares(memo: string) {
  return apiRequest<{ shares: Share[] }>(
    `/api/v1/memos/${encodeURIComponent(memo)}/shares`,
    {},
  );
}

export async function revokeShare(id: string) {
  return apiRequest<Share>(`/api/v1/shares/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function getPublicShare(token: string) {
  return apiRequest<PublicShare>(
    `/api/public/shares/${encodeURIComponent(token)}`,
    {},
    { authRequired: false },
  );
}
