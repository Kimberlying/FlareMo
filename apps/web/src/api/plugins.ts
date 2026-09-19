import { apiRequest } from "./client";

export type CardOptionValue = string | number | boolean;

export type InstalledPluginRecord = {
  id: string;
  version: string;
  source: string;
  manifest: Record<string, unknown>;
};

export type PluginSourceRecord = { id: string; name: string; url: string };

export type PluginSettings = {
  enabledPlugins: string[];
  disabledPlugins: string[];
  installed: InstalledPluginRecord[];
  sources: PluginSourceRecord[];
  cards: {
    order: string[];
    hidden: string[];
    default: string | null;
    options: Record<string, Record<string, CardOptionValue>>;
  };
};

export type PluginStoreCard = {
  id: string;
  kind: "document" | "sandbox";
  name: Record<string, string>;
  description?: Record<string, string>;
  preview?: string | null;
};

export type PluginStoreEntry = {
  id: string;
  version: string;
  tier: "official" | "community";
  name: Record<string, string>;
  description?: Record<string, string>;
  author?: { name: string; url?: string; email?: string };
  license?: string;
  minAppVersion?: string;
  preview: string | null;
  contributes?: { shareCardTemplates?: PluginStoreCard[] };
  artifact: { url: string; sha256: string; size: number };
  sourceId: string;
  installedVersion: string | null;
  installedSource: string | null;
};

export type PluginStoreDirectory = {
  id: string;
  name: string;
  url: string;
  error: string | null;
};

export type PluginStoreListing = {
  sources: PluginStoreDirectory[];
  entries: PluginStoreEntry[];
};

/** Public plugin configuration, readable without a session. */
export async function getPublicPluginSettings(): Promise<PluginSettings | null> {
  try {
    const response = await fetch("/api/app/plugins");
    if (!response.ok) return null;
    return (await response.json()) as PluginSettings;
  } catch {
    return null;
  }
}

export async function getAdminPluginSettings() {
  return apiRequest<PluginSettings>("/api/app/admin/plugins");
}

export async function updateAdminPluginSettings(patch: {
  enabledPlugins?: string[];
  disabledPlugins?: string[];
  sources?: PluginSourceRecord[];
  cards?: {
    order?: string[];
    hidden?: string[];
    default?: string | null;
    options?: Record<string, Record<string, CardOptionValue>>;
  };
}) {
  return apiRequest<PluginSettings>("/api/app/admin/plugins", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

/** Browse every configured directory (the official one first). */
export async function getPluginStore() {
  return apiRequest<PluginStoreListing>("/api/app/admin/plugins/store");
}

export async function installPlugin(id: string, sourceId?: string) {
  return apiRequest<{ installed: InstalledPluginRecord }>(
    "/api/app/admin/plugins/install",
    { method: "POST", body: JSON.stringify({ id, sourceId }) },
  );
}

export async function uninstallPlugin(id: string) {
  return apiRequest<{ removed: boolean; id: string }>(
    `/api/app/admin/plugins/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

/** Upload a local package (zip). Only this instance ever sees it. */
export async function uploadPluginPackage(file: File) {
  const bytes = await file.arrayBuffer();
  const response = await fetch("/api/app/admin/plugins/upload", {
    method: "POST",
    headers: { "content-type": "application/zip" },
    body: bytes,
  });
  if (!response.ok) {
    let message = "Failed to install the package.";
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      message = body.error?.message ?? message;
    } catch {
      // keep the fallback
    }
    throw new Error(message);
  }
  return (await response.json()) as { installed: InstalledPluginRecord };
}
