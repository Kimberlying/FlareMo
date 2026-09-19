import { apiRequest } from "./client";

export type EmailSettings = {
  revision: string | null;
  enabled: boolean;
  source: "database" | "environment" | "none";
  configured: boolean;
  provider: "none" | "cloudflare" | "resend";
  from: string | null;
  unreadable: boolean;
  previews: {
    apiKey: string;
    from: string;
    fromName: string;
  } | null;
  encrypted: boolean;
  canEncrypt: boolean;
};

export const getEmailSettings = () =>
  apiRequest<EmailSettings>("/api/app/admin/email-settings");

export const saveEmailSettings = (input: {
  revision: string | null;
  enabled: boolean;
  credentials: { apiKey: string; from: string; fromName: string };
}) =>
  apiRequest("/api/app/admin/email-settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });

export const deleteEmailSettings = (revision: string | null) =>
  apiRequest("/api/app/admin/email-settings", {
    method: "DELETE",
    body: JSON.stringify({ revision }),
  });

export const testEmailSettings = () =>
  apiRequest("/api/app/admin/email-settings/test", { method: "POST" });

export type OauthSettings = {
  revision: string | null;
  unreadable: boolean;
  source: "database" | "environment" | "none";
  previews: {
    google: {
      clientId: string;
      clientSecret: string;
      active: boolean;
    } | null;
    github: {
      clientId: string;
      clientSecret: string;
      active: boolean;
    } | null;
  };
  encrypted: boolean;
  canEncrypt: boolean;
};

export const getOauthSettings = () =>
  apiRequest<OauthSettings>("/api/app/admin/oauth-settings");

export const saveOauthSettings = (input: {
  revision: string | null;
  credentials: {
    google: { clientId: string; clientSecret: string };
    github: { clientId: string; clientSecret: string };
  };
}) =>
  apiRequest("/api/app/admin/oauth-settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });

export const deleteOauthSettings = (revision: string | null) =>
  apiRequest("/api/app/admin/oauth-settings", {
    method: "DELETE",
    body: JSON.stringify({ revision }),
  });

/** Anonymous: which social providers the instance has enabled. */
export type AuthProviders = { google: boolean; github: boolean };

export async function getAuthProviders(): Promise<AuthProviders | null> {
  try {
    const response = await fetch("/api/app/auth-providers");
    if (!response.ok) return null;
    return (await response.json()) as AuthProviders;
  } catch {
    return null;
  }
}
