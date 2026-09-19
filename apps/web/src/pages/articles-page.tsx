import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ExternalLinkIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  createArticle,
  deleteArticle,
  listArticles,
  restoreArticle,
} from "@/api";
import { SubpageHeader } from "@/components/subpage-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { stripResourceName } from "@/lib/utils";

/**
 * Article list: drafts and published pieces with one-tap entry back into the
 * editor. Creating an article immediately allocates its draft row, so the
 * editor can bind inline uploads from the first keystroke.
 */
/**
 * Editor URLs carry the bare uuid (`/articles/<uuid>/edit`), matching the
 * `/memo/<uuid>` convention. The namespaced form (`articles/<uuid>`) would
 * percent-encode its slash into the path; browsers normalize `%2F` back to a
 * real slash on a cold load, growing an extra path segment and breaking the
 * route match. The API resolves bare ids either way.
 */
function editorId(articleId: string): string {
  return stripResourceName(articleId, "articles");
}

export function ArticlesPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const articlesQuery = useQuery({
    queryKey: ["articles"],
    // include_deleted feeds the recycle-bin affordances below (restore action
    // + the "in recycle bin" label); without it those rows never arrive.
    queryFn: () => listArticles({ include_deleted: true }),
  });

  const createMutation = useMutation({
    mutationFn: () => createArticle({ title: "" }),
    onSuccess: ({ article }) => {
      void queryClient.invalidateQueries({ queryKey: ["articles"] });
      navigate({
        to: "/articles/$articleId/edit",
        params: { articleId: editorId(article.id) },
      });
    },
    onError: () => toast.error(t("article.createFailed")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteArticle(id),
    onSuccess: () => {
      toast.success(t("article.deleted"));
      void queryClient.invalidateQueries({ queryKey: ["articles"] });
    },
    onError: () => toast.error(t("article.deleteFailed")),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => restoreArticle(id),
    onSuccess: () => {
      toast.success(t("article.restored"));
      void queryClient.invalidateQueries({ queryKey: ["articles"] });
    },
  });

  const articles = articlesQuery.data?.articles ?? [];

  return (
    <div className="min-h-svh bg-background px-4 py-6 sm:py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <SubpageHeader
          actions={
            <Button
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
              size="sm"
              type="button"
            >
              {createMutation.isPending ? (
                <PlusIcon className="size-4 animate-pulse" />
              ) : (
                <PlusIcon className="size-4" />
              )}
              {t("article.newAction")}
            </Button>
          }
          title={t("nav.articles")}
        />
        {articlesQuery.isLoading && (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}
        {articlesQuery.data && articles.length === 0 && (
          <Empty className="min-h-72 border">
            <EmptyHeader>
              <EmptyTitle>{t("article.emptyTitle")}</EmptyTitle>
              <EmptyDescription>
                {t("article.emptyDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {articlesQuery.data && articles.length > 0 && (
          <div className="flex flex-col gap-3">
            {articles.map((article) => (
              <Card
                className="py-3 transition-colors hover:bg-muted/40"
                key={article.id}
              >
                <CardHeader className="pb-0">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <button
                      className="min-w-0 flex-1 truncate text-left font-semibold hover:underline"
                      onClick={() =>
                        navigate({
                          to: "/articles/$articleId/edit",
                          params: { articleId: editorId(article.id) },
                        })
                      }
                      type="button"
                    >
                      {article.title || t("article.untitled")}
                    </button>
                    <Badge
                      variant={
                        article.status === "published" ? "default" : "secondary"
                      }
                    >
                      {article.status === "published"
                        ? t("article.publishedBadge")
                        : t("article.draftBadge")}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">
                    {article.deleted_at
                      ? t("article.inRecycleBin")
                      : article.updated_at.slice(0, 10)}
                  </span>
                  <div className="flex items-center gap-1">
                    {article.status === "published" && !article.deleted_at && (
                      <Button
                        aria-label={t("article.viewPublic")}
                        onClick={() =>
                          window.open(`/article/${article.slug}`, "_blank")
                        }
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <ExternalLinkIcon className="size-4" />
                      </Button>
                    )}
                    {article.deleted_at ? (
                      <Button
                        onClick={() => restoreMutation.mutate(article.id)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        {t("article.restoreAction")}
                      </Button>
                    ) : (
                      <Button
                        aria-label={t("common.delete")}
                        onClick={() => {
                          if (window.confirm(t("article.deleteConfirm"))) {
                            deleteMutation.mutate(article.id);
                          }
                        }}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
