import {
  listBundledPluginsSorted,
  resolveOptionValues,
  type ShareCardOptionSpec,
  type ShareCardOptionValue,
} from "@flaremo/plugins";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  EyeIcon,
  EyeOffIcon,
  FileUpIcon,
  Loader2Icon,
  PackageIcon,
  RefreshCwIcon,
  StarIcon,
  StoreIcon,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getAdminPluginSettings,
  getPluginStore,
  installPlugin,
  type PluginSettings,
  type PluginStoreEntry,
  uninstallPlugin,
  updateAdminPluginSettings,
  uploadPluginPackage,
} from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/i18n";
import { errorMessage } from "@/lib/error";
import { allCardViews, type ShareCardView } from "@/lib/plugin-cards";
import { cn } from "@/lib/utils";

/**
 * Owner-side plugin management: the plugin list (bundled + installed), the
 * store (browse directories, install/update/uninstall, upload a local
 * package), and per-card controls (order, default, visibility, options).
 *
 * The bundled registry compiles into the app; store packages live in this
 * instance's R2 and their manifests ride along in the settings record, which
 * is why card management can list them without extra fetches. Official
 * plugins default on, community/store plugins default off — enabling one here
 * is the only path that makes it visible to users.
 */

type PluginRow = {
  id: string;
  name: string;
  version: string;
  tier: "official" | "community";
  source: "bundled" | "installed";
  cardCount: number;
};

function localized(
  table: Record<string, string> | undefined,
  locale: string,
  fallback: string,
): string {
  if (!table) return fallback;
  return table[locale] ?? table["en-US"] ?? Object.values(table)[0] ?? fallback;
}

export function PluginsCard() {
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: ["admin-plugins"],
    queryFn: getAdminPluginSettings,
    retry: false,
  });
  const storeQuery = useQuery({
    queryKey: ["admin-plugin-store"],
    queryFn: getPluginStore,
    retry: false,
    staleTime: 60_000,
  });

  const settings = settingsQuery.data ?? null;

  const plugins: PluginRow[] = useMemo(() => {
    const bundled: PluginRow[] = listBundledPluginsSorted().map((plugin) => ({
      id: plugin.manifest.id,
      name: localized(plugin.manifest.name, locale, plugin.manifest.id),
      version: plugin.manifest.version,
      tier: plugin.tier,
      source: "bundled",
      cardCount: plugin.cards.length,
    }));
    const installed: PluginRow[] = (settings?.installed ?? []).map((record) => {
      const cards = allCardViews(settings).filter(
        (card) => card.pluginId === record.id && card.source === "installed",
      );
      const name = (record.manifest.name ?? {}) as Record<string, string>;
      return {
        id: record.id,
        name: localized(name, locale, record.id),
        version: record.version,
        tier: "community" as const,
        source: "installed" as const,
        cardCount: cards.length,
      };
    });
    // An installed package could reuse a bundled plugin's id; the installed
    // row wins so the version shown matches what the assets serve.
    const seen = new Set<string>();
    return [...installed, ...bundled].filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
  }, [locale, settings]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-plugins"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-plugin-store"] });
    void queryClient.invalidateQueries({ queryKey: ["plugin-settings"] });
  };

  const saveMutation = useMutation({
    mutationFn: (
      next: Pick<
        PluginSettings,
        "enabledPlugins" | "disabledPlugins" | "cards"
      >,
    ) =>
      updateAdminPluginSettings({
        enabledPlugins: next.enabledPlugins,
        disabledPlugins: next.disabledPlugins,
        cards: {
          order: next.cards.order,
          hidden: next.cards.hidden,
          default: next.cards.default,
          options: next.cards.options,
        },
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(["admin-plugins"], saved);
      invalidate();
      toast.success(t("admin.plugins.saved"));
    },
    onError: (error) =>
      toast.error(errorMessage(error, t("admin.plugins.failed"))),
  });

  const installMutation = useMutation({
    mutationFn: ({ id, sourceId }: { id: string; sourceId: string }) =>
      installPlugin(id, sourceId),
    onSuccess: () => {
      invalidate();
      toast.success(t("admin.plugins.installed"));
    },
    onError: (error) =>
      toast.error(errorMessage(error, t("admin.plugins.installFailed"))),
  });

  const uninstallMutation = useMutation({
    mutationFn: (id: string) => uninstallPlugin(id),
    onSuccess: () => {
      invalidate();
      toast.success(t("admin.plugins.uninstalled"));
    },
    onError: (error) =>
      toast.error(errorMessage(error, t("admin.plugins.uninstallFailed"))),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadPluginPackage(file),
    onSuccess: (result) => {
      setUploadError(null);
      invalidate();
      toast.success(t("admin.plugins.uploaded", { name: result.installed.id }));
    },
    onError: (error) => {
      const message = errorMessage(error, t("admin.plugins.uploadFailed"));
      setUploadError(message);
      toast.error(message);
    },
  });

  if (!settings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.plugins.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            {t("admin.plugins.loading")}
          </div>
        </CardContent>
      </Card>
    );
  }

  const enabledSet = new Set(settings.enabledPlugins);
  const disabledSet = new Set(settings.disabledPlugins);
  const hiddenSet = new Set(settings.cards.hidden);
  const busy =
    saveMutation.isPending ||
    installMutation.isPending ||
    uninstallMutation.isPending ||
    uploadMutation.isPending;

  const pluginEnabled = (row: PluginRow) =>
    enabledSet.has(row.id)
      ? true
      : disabledSet.has(row.id)
        ? false
        : row.source === "bundled" && row.tier === "official";

  const togglePlugin = (row: PluginRow, on: boolean) => {
    const next = {
      enabledPlugins: settings.enabledPlugins.filter((id) => id !== row.id),
      disabledPlugins: settings.disabledPlugins.filter((id) => id !== row.id),
      cards: settings.cards,
    };
    if (on) next.enabledPlugins.push(row.id);
    else next.disabledPlugins.push(row.id);
    saveMutation.mutate(next);
  };

  const cards = allCardViews(settings);
  const orderedCards = (() => {
    const orderIndex = new Map(
      settings.cards.order.map((id, index) => [id, index] as const),
    );
    const registryIndex = new Map(
      cards.map((card, index) => [card.id, index] as const),
    );
    return [...cards].sort((a, b) => {
      const aOrder = orderIndex.get(a.id);
      const bOrder = orderIndex.get(b.id);
      if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
      if (aOrder !== undefined) return -1;
      if (bOrder !== undefined) return 1;
      return (registryIndex.get(a.id) ?? 0) - (registryIndex.get(b.id) ?? 0);
    });
  })();

  const moveCard = (cardId: string, direction: -1 | 1) => {
    const visibleIds = orderedCards
      .filter((entry) => !hiddenSet.has(entry.id))
      .map((entry) => entry.id);
    const order = settings.cards.order.filter((id) => visibleIds.includes(id));
    const base = [...order, ...visibleIds.filter((id) => !order.includes(id))];
    const index = base.indexOf(cardId);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= base.length) return;
    const nextBase = [...base];
    const [moved] = nextBase.splice(index, 1);
    nextBase.splice(target, 0, moved as string);
    saveMutation.mutate({
      ...settings,
      cards: { ...settings.cards, order: nextBase },
    });
  };

  const toggleHidden = (cardId: string) => {
    const hidden = hiddenSet.has(cardId)
      ? settings.cards.hidden.filter((id) => id !== cardId)
      : [...settings.cards.hidden, cardId];
    const clearingDefault =
      settings.cards.default === cardId && hidden.includes(cardId);
    saveMutation.mutate({
      ...settings,
      cards: {
        ...settings.cards,
        hidden,
        default: clearingDefault ? null : settings.cards.default,
      },
    });
  };

  const setDefault = (cardId: string) => {
    saveMutation.mutate({
      ...settings,
      cards: {
        ...settings.cards,
        default: settings.cards.default === cardId ? null : cardId,
      },
    });
  };

  const setOption = (
    cardId: string,
    key: string,
    value: ShareCardOptionValue,
  ) => {
    const cardOptions = { ...(settings.cards.options[cardId] ?? {}) };
    cardOptions[key] = value;
    saveMutation.mutate({
      ...settings,
      cards: {
        ...settings.cards,
        options: { ...settings.cards.options, [cardId]: cardOptions },
      },
    });
  };

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) uploadMutation.mutate(file);
  };

  const storeEntries = storeQuery.data?.entries ?? [];
  const storeSourceName = (sourceId: string) =>
    storeQuery.data?.sources.find((source) => source.id === sourceId)?.name ??
    sourceId;

  const installButtonFor = (entry: PluginStoreEntry) => {
    const updating = entry.installedVersion !== null;
    return (
      <Button
        disabled={busy}
        size="sm"
        type="button"
        variant={updating ? "outline" : "default"}
        onClick={() =>
          installMutation.mutate({ id: entry.id, sourceId: entry.sourceId })
        }
      >
        {installMutation.isPending &&
        installMutation.variables?.id === entry.id ? (
          <Loader2Icon className="animate-spin" data-icon="inline-start" />
        ) : (
          <PackageIcon data-icon="inline-start" />
        )}
        {updating
          ? t("admin.plugins.updateTo", { version: entry.version })
          : t("admin.plugins.install")}
      </Button>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.plugins.title")}</CardTitle>
          <CardDescription>{t("admin.plugins.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">{t("admin.plugins.plugins")}</p>
            {plugins.map((row) => (
              <div
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
                key={row.id}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{row.name}</p>
                    <Badge variant="secondary">
                      {t(
                        row.source === "installed"
                          ? "admin.plugins.tierStore"
                          : row.tier === "official"
                            ? "admin.plugins.tierOfficial"
                            : "admin.plugins.tierCommunity",
                      )}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {t("admin.plugins.cardCount", { count: row.cardCount })} · v
                    {row.version}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {row.source === "installed" && (
                    <Button
                      aria-label={t("admin.plugins.uninstall")}
                      disabled={busy}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                      onClick={() => uninstallMutation.mutate(row.id)}
                    >
                      <Trash2Icon />
                    </Button>
                  )}
                  <Switch
                    checked={pluginEnabled(row)}
                    disabled={busy}
                    onCheckedChange={(checked) => togglePlugin(row, checked)}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">{t("admin.plugins.cards")}</p>
            {orderedCards.map((card: ShareCardView, _index, all) => {
              const pluginRow = plugins.find((row) => row.id === card.pluginId);
              const reachable = pluginRow ? pluginEnabled(pluginRow) : false;
              const hidden = hiddenSet.has(card.id);
              const isDefault = settings.cards.default === card.id;
              const options = resolveOptionValues(
                card.options,
                settings.cards.options[card.id],
              );
              const visibleEntries = all.filter(
                (candidate) => !hiddenSet.has(candidate.id),
              );
              const visibleIndex = visibleEntries.findIndex(
                (candidate) => candidate.id === card.id,
              );
              const optionSpecs: ShareCardOptionSpec[] = card.options ?? [];
              return (
                <div
                  className={cn(
                    "flex flex-col gap-3 rounded-lg border px-3 py-3",
                    !reachable && "opacity-60",
                  )}
                  key={card.id}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">
                          {localized(card.name, locale, card.id)}
                        </p>
                        <Badge variant="outline">
                          {t(
                            card.kind === "sandbox"
                              ? "admin.plugins.kindSandbox"
                              : "admin.plugins.kindDocument",
                          )}
                        </Badge>
                        {isDefault && (
                          <Badge>{t("admin.plugins.defaultBadge")}</Badge>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {pluginRow?.name ?? card.pluginId}
                        {!reachable && ` · ${t("admin.plugins.pluginOff")}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        aria-label={t("admin.plugins.moveUp")}
                        disabled={busy || hidden || visibleIndex <= 0}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                        onClick={() => moveCard(card.id, -1)}
                      >
                        <ArrowUpIcon />
                      </Button>
                      <Button
                        aria-label={t("admin.plugins.moveDown")}
                        disabled={
                          busy ||
                          hidden ||
                          visibleIndex === -1 ||
                          visibleIndex >= visibleEntries.length - 1
                        }
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                        onClick={() => moveCard(card.id, 1)}
                      >
                        <ArrowDownIcon />
                      </Button>
                      <Button
                        aria-label={t("admin.plugins.setDefault")}
                        disabled={busy || hidden}
                        size="icon-sm"
                        type="button"
                        variant={isDefault ? "secondary" : "ghost"}
                        onClick={() => setDefault(card.id)}
                      >
                        <StarIcon />
                      </Button>
                      <Button
                        aria-label={
                          hidden
                            ? t("admin.plugins.show")
                            : t("admin.plugins.hide")
                        }
                        disabled={busy}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                        onClick={() => toggleHidden(card.id)}
                      >
                        {hidden ? <EyeOffIcon /> : <EyeIcon />}
                      </Button>
                    </div>
                  </div>
                  {optionSpecs.length > 0 && (
                    <div className="flex flex-col gap-2 border-t pt-3">
                      {optionSpecs.map((spec) => {
                        const value = options[spec.key];
                        return (
                          <div
                            className="flex items-center justify-between gap-3"
                            key={spec.key}
                          >
                            <span className="text-xs text-muted-foreground">
                              {localized(spec.label, locale, spec.key)}
                            </span>
                            {spec.type === "boolean" && (
                              <Switch
                                checked={value === true}
                                disabled={busy}
                                onCheckedChange={(checked) =>
                                  setOption(card.id, spec.key, checked)
                                }
                              />
                            )}
                            {spec.type === "text" && (
                              <Input
                                className="h-7 w-44"
                                disabled={busy}
                                maxLength={spec.maxLength ?? 500}
                                value={typeof value === "string" ? value : ""}
                                onChange={(event) =>
                                  setOption(
                                    card.id,
                                    spec.key,
                                    event.target.value,
                                  )
                                }
                              />
                            )}
                            {spec.type === "color" && (
                              <input
                                className="size-7 cursor-pointer rounded border bg-transparent"
                                disabled={busy}
                                type="color"
                                value={
                                  typeof value === "string" ? value : "#000000"
                                }
                                onChange={(event) =>
                                  setOption(
                                    card.id,
                                    spec.key,
                                    event.target.value,
                                  )
                                }
                              />
                            )}
                            {spec.type === "number" && (
                              <Input
                                className="h-7 w-24"
                                disabled={busy}
                                max={spec.max}
                                min={spec.min}
                                step={spec.step}
                                type="number"
                                value={typeof value === "number" ? value : 0}
                                onChange={(event) =>
                                  setOption(
                                    card.id,
                                    spec.key,
                                    Number(event.target.value),
                                  )
                                }
                              />
                            )}
                            {spec.type === "enum" && (
                              <select
                                className="h-7 rounded-md border bg-transparent px-2 text-xs"
                                disabled={busy}
                                value={typeof value === "string" ? value : ""}
                                onChange={(event) =>
                                  setOption(
                                    card.id,
                                    spec.key,
                                    event.target.value,
                                  )
                                }
                              >
                                {spec.choices.map((choice) => (
                                  <option
                                    key={choice.value}
                                    value={choice.value}
                                  >
                                    {localized(
                                      choice.label,
                                      locale,
                                      choice.value,
                                    )}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex flex-col gap-1">
            <CardTitle>{t("admin.plugins.store")}</CardTitle>
            <CardDescription>
              {t("admin.plugins.storeDescription")}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <input
              accept=".zip,application/zip"
              className="hidden"
              ref={uploadInputRef}
              type="file"
              onChange={handleUpload}
            />
            <Button
              disabled={busy}
              size="sm"
              type="button"
              variant="outline"
              onClick={() => uploadInputRef.current?.click()}
            >
              {uploadMutation.isPending ? (
                <Loader2Icon
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <FileUpIcon data-icon="inline-start" />
              )}
              {t("admin.plugins.upload")}
            </Button>
            <Button
              aria-label={t("admin.plugins.refresh")}
              disabled={storeQuery.isFetching}
              size="icon-sm"
              type="button"
              variant="ghost"
              onClick={() => void storeQuery.refetch()}
            >
              <RefreshCwIcon
                className={storeQuery.isFetching ? "animate-spin" : undefined}
              />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {uploadError && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">
              {uploadError}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <StoreIcon className="size-4 shrink-0 text-muted-foreground" />
            {(storeQuery.data?.sources ?? []).map((source) => (
              <Badge
                key={source.id}
                title={source.url}
                variant={source.error ? "destructive" : "secondary"}
              >
                {source.name}
                {source.error ? ` · ${source.error}` : ""}
              </Badge>
            ))}
          </div>
          {storeQuery.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              {t("admin.plugins.loading")}
            </div>
          )}
          {storeQuery.isError && (
            <p className="text-sm text-muted-foreground">
              {t("admin.plugins.storeUnavailable")}
            </p>
          )}
          {storeEntries.map((entry) => (
            <div
              className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
              key={`${entry.sourceId}:${entry.id}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                {entry.preview ? (
                  <img
                    alt=""
                    className="size-10 shrink-0 rounded border object-cover"
                    loading="lazy"
                    src={entry.preview}
                  />
                ) : (
                  <div className="flex size-10 shrink-0 items-center justify-center rounded border bg-muted/40">
                    <PackageIcon className="size-4 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">
                      {localized(entry.name, locale, entry.id)}
                    </p>
                    <Badge variant="secondary">
                      {t(
                        entry.tier === "official"
                          ? "admin.plugins.tierOfficial"
                          : "admin.plugins.tierCommunity",
                      )}
                    </Badge>
                    {entry.installedVersion && (
                      <Badge variant="outline">
                        {t("admin.plugins.installedBadge", {
                          version: entry.installedVersion,
                        })}
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {localized(entry.description, locale, "") ||
                      entry.author?.name ||
                      storeSourceName(entry.sourceId)}
                  </p>
                  {(entry.contributes?.shareCardTemplates ?? []).some(
                    (card) => card.preview,
                  ) && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(entry.contributes?.shareCardTemplates ?? [])
                        .filter((card) => card.preview)
                        .slice(0, 5)
                        .map((card) => (
                          <img
                            alt={localized(card.name, locale, card.id)}
                            className="h-14 w-auto rounded border object-cover"
                            key={card.id}
                            loading="lazy"
                            src={card.preview ?? ""}
                            title={localized(card.name, locale, card.id)}
                          />
                        ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {installButtonFor(entry)}
              </div>
            </div>
          ))}
          {storeQuery.data && storeEntries.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t("admin.plugins.storeEmpty")}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
