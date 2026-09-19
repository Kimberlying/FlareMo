import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { Editor } from "@tiptap/react";
import {
  ArrowLeftIcon,
  BoldIcon,
  CodeIcon,
  ExternalLinkIcon,
  EyeIcon,
  Heading2Icon,
  Heading3Icon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  ListTodoIcon,
  Loader2Icon,
  MinusIcon,
  PencilIcon,
  QuoteIcon,
  StrikethroughIcon,
  TableIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  type Article,
  deleteArticle,
  getArticle,
  updateArticle,
  uploadAttachment,
} from "@/api";
import { ArticleEditor, extractImageFiles } from "@/components/article-editor";
import { ArticlePublishDialog } from "@/components/article-publish-dialog";
import { ArticleShikiBody } from "@/components/article-shiki-body";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { uploadAndInsertImages } from "@/lib/rich-editor-upload";

const AUTOSAVE_DEBOUNCE_MS = 2000;

type SaveState = "idle" | "dirty" | "saving" | "saved";

/**
 * The article editor surface. One article is one draft row: /articles/new
 * creates it up front (uploads bind articleId immediately, so inline images
 * survive the orphan GC), and every keystroke lands in a 2s-debounced PATCH
 * that also flushes on unmount / beforeunload.
 */
export function ArticleEditorPage({ articleId }: { articleId: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const articleQuery = useQuery({
    queryKey: ["article", articleId],
    queryFn: () => getArticle(articleId),
    retry: false,
  });

  const article = articleQuery.data?.article;
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [savedArticle, setSavedArticle] = useState<Article | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [isUploadingImages, setIsUploadingImages] = useState(false);

  const editorRef = useRef<Editor | null>(null);
  const titleRef = useRef("");
  const contentRef = useRef("");
  const seededRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedArticleRef = useRef<Article | null>(null);
  savedArticleRef.current = savedArticle;
  const latestRef = useRef({ title: "", content: "" });

  useEffect(() => {
    if (!article || seededRef.current) return;
    seededRef.current = true;
    titleRef.current = article.title;
    contentRef.current = article.content;
    setTitle(article.title);
    setContent(article.content);
    setSavedArticle(article);
    latestRef.current = { title: article.title, content: article.content };
    setSaveState("saved");
  }, [article]);

  const saveMutation = useMutation({
    mutationFn: (patch: { title?: string; content?: string }) =>
      updateArticle(articleId, patch),
    onSuccess: ({ article: updated }) => {
      setSavedArticle(updated);
      setSaveState("saved");
      queryClient.setQueryData(["article", articleId], { article: updated });
    },
    onError: () => {
      toast.error(t("article.autosaveFailed"));
      setSaveState("dirty");
    },
  });
  // useMutation returns a fresh object every render (the spread), so the save
  // call goes through a ref: flushSave must keep a stable identity, or the
  // unmount effect below would re-run — and flush — on every keystroke,
  // defeating the debounce. mutateAsync itself is the observer's bound method
  // and is stable.
  const saveRef = useRef(saveMutation.mutateAsync);
  saveRef.current = saveMutation.mutateAsync;

  const flushSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const current = savedArticleRef.current;
    const next = latestRef.current;
    if (
      !current ||
      (next.title === current.title && next.content === current.content)
    ) {
      // Nothing to persist. TipTap normalizes markdown on mount and the
      // resulting onUpdate schedules a save whose round-trip is a no-op;
      // leaving the indicator on "dirty" would show 未保存 forever for an
      // article that is fully saved.
      if (current) {
        setSaveState((state) => (state === "dirty" ? "saved" : state));
      }
      return;
    }
    setSaveState("saving");
    void saveRef
      .current({ title: next.title, content: next.content })
      .catch(() => undefined);
  }, []);

  const scheduleSave = useCallback(() => {
    setSaveState("dirty");
    latestRef.current = {
      title: titleRef.current,
      content: contentRef.current,
    };
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flushSave, AUTOSAVE_DEBOUNCE_MS);
  }, [flushSave]);

  const keepaliveFlush = useCallback(() => {
    const next = latestRef.current;
    const current = savedArticleRef.current;
    if (
      !current ||
      (next.title === current.title && next.content === current.content)
    ) {
      return;
    }
    void fetch(`/api/app/articles/${encodeURIComponent(articleId)}`, {
      body: JSON.stringify({ title: next.title, content: next.content }),
      headers: { "content-type": "application/json" },
      keepalive: true,
      method: "PATCH",
    });
  }, [articleId]);

  // Flush pending edits when leaving the editor or closing the tab.
  useEffect(() => {
    window.addEventListener("beforeunload", keepaliveFlush);
    return () => {
      window.removeEventListener("beforeunload", keepaliveFlush);
      flushSave();
    };
  }, [flushSave, keepaliveFlush]);

  const deleteMutation = useMutation({
    mutationFn: () => deleteArticle(articleId),
    onSuccess: () => {
      toast.success(t("article.deleted"));
      void queryClient.invalidateQueries({ queryKey: ["articles"] });
      navigate({ to: "/articles" });
    },
    onError: () => toast.error(t("article.deleteFailed")),
  });

  const enqueueInlineUploads = (files: File[], position: number) => {
    const images = extractImageFiles(files);
    if (images.length === 0) return;
    setIsUploadingImages(true);
    void uploadAndInsertImages({
      editorRef,
      files: images,
      onError: () => toast.error(t("article.imageUploadFailed")),
      position,
      upload: (file) => uploadAttachment({ file, article: articleId }),
    }).finally(() => setIsUploadingImages(false));
  };

  if (articleQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-[50vh] w-full" />
      </div>
    );
  }

  if (articleQuery.isError || !article) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        {t("article.loadFailed")}
      </div>
    );
  }

  const isPublished = article.status === "published";
  const shownArticle = savedArticle ?? article;

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-3 px-4 py-6">
      <header className="flex flex-wrap items-center gap-2">
        <Button
          aria-label={t("common.back")}
          onClick={() => navigate({ to: "/articles" })}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
        <Input
          aria-label={t("article.titleLabel")}
          className="h-9 flex-1 border-0 bg-transparent px-2 text-lg font-semibold shadow-none focus-visible:ring-0"
          onChange={(event) => {
            // The refs — not React state — are what the debounced save reads
            // (state is stale inside the timer closure), so both must update
            // on every keystroke.
            titleRef.current = event.target.value;
            setTitle(event.target.value);
            scheduleSave();
          }}
          placeholder={t("article.titlePlaceholder")}
          value={title}
        />
        <span
          className="text-xs text-muted-foreground"
          data-article-save-state={saveState}
        >
          {saveState === "saving"
            ? t("article.saving")
            : saveState === "dirty"
              ? t("article.unsaved")
              : t("article.saved")}
        </span>
        {isPublished && (
          <Button
            onClick={() =>
              window.open(`/article/${shownArticle.slug}`, "_blank")
            }
            size="sm"
            type="button"
            variant="ghost"
          >
            <ExternalLinkIcon className="size-4" />
            {t("article.viewPublic")}
          </Button>
        )}
        <Button
          onClick={() => setPreviewMode((mode) => !mode)}
          size="sm"
          type="button"
          variant="ghost"
        >
          {previewMode ? (
            <>
              <PencilIcon className="size-4" />
              {t("article.editMode")}
            </>
          ) : (
            <>
              <EyeIcon className="size-4" />
              {t("article.previewAction")}
            </>
          )}
        </Button>
        <Button
          disabled={isUploadingImages}
          onClick={() => setPublishOpen(true)}
          size="sm"
          type="button"
          variant={isPublished ? "outline" : "default"}
        >
          {isUploadingImages && <Loader2Icon className="size-4 animate-spin" />}
          {isPublished
            ? t("article.publishedBadge")
            : t("article.publishAction")}
        </Button>
        <Button
          onClick={() => {
            if (window.confirm(t("article.deleteConfirm"))) {
              deleteMutation.mutate();
            }
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t("common.delete")}
        </Button>
      </header>

      {previewMode ? (
        <div className="memo-markdown min-h-svh px-2 text-[15px] leading-7">
          <h1 className="mb-2 text-2xl font-semibold tracking-tight">
            {title || t("article.titlePlaceholder")}
          </h1>
          <ArticleShikiBody content={content} />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <ArticleToolbar editorRef={editorRef} />
          <ArticleEditor
            content={content}
            disabled={false}
            editorRef={editorRef}
            onContentChange={(next) => {
              contentRef.current = next;
              setContent(next);
              scheduleSave();
            }}
            onImageFiles={enqueueInlineUploads}
            placeholder={t("article.contentPlaceholder")}
          />
        </div>
      )}

      <ArticlePublishDialog
        article={shownArticle}
        onOpenChange={setPublishOpen}
        onPublished={(updated) => {
          setSavedArticle(updated);
          void queryClient.invalidateQueries({ queryKey: ["articles"] });
        }}
        onUnpublished={(updated) => {
          setSavedArticle(updated);
          void queryClient.invalidateQueries({ queryKey: ["articles"] });
        }}
        open={publishOpen}
      />
    </div>
  );
}

function ArticleToolbar({
  editorRef,
}: {
  editorRef: React.RefObject<Editor | null>;
}) {
  const { t } = useI18n();
  const run = (action: (editor: Editor) => void) => () => {
    const editor = editorRef.current;
    if (editor) action(editor);
  };
  const tools = [
    {
      icon: <Heading2Icon className="size-4" />,
      label: t("article.toolH2"),
      run: run((editor) => {
        editor.chain().focus().toggleHeading({ level: 2 }).run();
      }),
    },
    {
      icon: <Heading3Icon className="size-4" />,
      label: t("article.toolH3"),
      run: run((editor) => {
        editor.chain().focus().toggleHeading({ level: 3 }).run();
      }),
    },
    {
      icon: <BoldIcon className="size-4" />,
      label: t("article.toolBold"),
      run: run((editor) => {
        editor.chain().focus().toggleBold().run();
      }),
    },
    {
      icon: <ItalicIcon className="size-4" />,
      label: t("article.toolItalic"),
      run: run((editor) => {
        editor.chain().focus().toggleItalic().run();
      }),
    },
    {
      icon: <StrikethroughIcon className="size-4" />,
      label: t("article.toolStrike"),
      run: run((editor) => {
        editor.chain().focus().toggleStrike().run();
      }),
    },
    {
      icon: <CodeIcon className="size-4" />,
      label: t("article.toolCode"),
      run: run((editor) => {
        editor.chain().focus().toggleCode().run();
      }),
    },
    {
      icon: <ListIcon className="size-4" />,
      label: t("article.toolBulletList"),
      run: run((editor) => {
        editor.chain().focus().toggleBulletList().run();
      }),
    },
    {
      icon: <ListOrderedIcon className="size-4" />,
      label: t("article.toolOrderedList"),
      run: run((editor) => {
        editor.chain().focus().toggleOrderedList().run();
      }),
    },
    {
      icon: <ListTodoIcon className="size-4" />,
      label: t("article.toolTaskList"),
      run: run((editor) => {
        editor.chain().focus().toggleTaskList().run();
      }),
    },
    {
      icon: <QuoteIcon className="size-4" />,
      label: t("article.toolQuote"),
      run: run((editor) => {
        editor.chain().focus().toggleBlockquote().run();
      }),
    },
    {
      icon: <MinusIcon className="size-4" />,
      label: t("article.toolRule"),
      run: run((editor) => {
        editor.chain().focus().setHorizontalRule().run();
      }),
    },
    {
      icon: <TableIcon className="size-4" />,
      label: t("article.toolTable"),
      run: run((editor) => {
        editor
          .chain()
          .focus()
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run();
      }),
    },
  ];
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-border/60 p-1">
      {tools.map((tool) => (
        <Button
          aria-label={tool.label}
          key={tool.label}
          onClick={tool.run}
          size="icon"
          title={tool.label}
          type="button"
          variant="ghost"
        >
          {tool.icon}
        </Button>
      ))}
    </div>
  );
}
