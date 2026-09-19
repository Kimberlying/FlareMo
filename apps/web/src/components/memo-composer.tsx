import type { Editor } from "@tiptap/react";
import {
  CalendarPlusIcon,
  CheckSquareIcon,
  HashIcon,
  ImageIcon,
  ListIcon,
  ListOrderedIcon,
  Loader2Icon,
  LockIcon,
  MicIcon,
  PaperclipIcon,
  SendIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import {
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";
import { getCaptureStatus, type MemoVisibility, uploadAttachment } from "@/api";
import { RichComposerEditor } from "@/components/rich-composer-editor-lazy";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";
import { transcribeCapturedAudio } from "@/lib/audio-capture/batch";
import { CaptureController } from "@/lib/audio-capture/controller";
import { createCaptureAudioSink } from "@/lib/audio-capture/encoder";
import { openMicrophone } from "@/lib/audio-capture/microphone";
import { joinFinalSentences } from "@/lib/audio-capture/plain-text";
import type { MemoCaptureInput } from "@/lib/local-memo-capture";
import { extractTags } from "@/lib/memo";
import { uploadAndInsertImages } from "@/lib/rich-editor-upload";
import {
  filterTagSuggestions,
  type TagSuggestion,
} from "@/lib/tag-autocomplete";

type MemoComposerProps = {
  draft: MemoCaptureInput;
  isPending: boolean;
  /** Rendered only when the viewer holds a team membership. */
  showVisibility?: boolean;
  /** Known tags with usage counts, powering the "#" autocomplete. */
  tags?: TagSuggestion[];
  /** Streaming/batch ASR is configured on the instance. */
  captureAvailable?: boolean;
  onDraftChange: (draft: MemoCaptureInput) => void;
  onSubmit: (input: MemoCaptureInput) => Promise<void>;
  onVisibilityChange?: (visibility: MemoVisibility) => void;
};

const fileKeys = new WeakMap<File, string>();
let nextFileKey = 0;

/**
 * Placeholder while the editor chunk streams in on the very first visit; the
 * idle prefetch makes this flash last one frame in practice.
 */
function ComposerEditorSkeleton() {
  return (
    <div className="min-h-32 rounded-t-xl bg-muted/30" aria-hidden="true" />
  );
}

function getFileKey(file: File) {
  const existing = fileKeys.get(file);
  if (existing) return existing;

  const key = `file-${nextFileKey}`;
  nextFileKey += 1;
  fileKeys.set(file, key);
  return key;
}

function formatVoiceClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function MemoComposer({
  draft,
  isPending,
  showVisibility = false,
  tags,
  captureAvailable = false,
  onDraftChange,
  onSubmit,
  onVisibilityChange,
}: MemoComposerProps) {
  const { t } = useI18n();
  const editorRef = useRef<Editor | null>(null);
  const canSubmit = Boolean(draft.content.trim() || draft.files.length > 0);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  // Idle state shrinks to one line (flomo-style): unfocused and empty. Focus
  // or any content expands the editor back to full height.
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const isCompact = !isComposerFocused && !canSubmit && !isPending;
  // "#" autocomplete: the in-progress tag token under the caret (reported by
  // the editor's transactions) plus the highlighted row.
  const [activeTagToken, setActiveTagToken] = useState<{
    from: number;
    text: string;
  } | null>(null);
  // Quick voice capture: one streaming/batch ASR session per composer, wired
  // the same way as the capture page. The controller persists with the
  // composer (workspace filters keep it mounted) so a draft survives a visit
  // to the archive or trash.
  const [captureController] = useState(
    () =>
      new CaptureController({
        microphone: openMicrophone,
        status: getCaptureStatus,
        socket: () =>
          new WebSocket(
            `${location.origin.replace(/^http/, "ws")}/api/app/capture/ws`,
          ),
        // Batch ASR (rollout §3.3): used only when /status reports a batch
        // provider; the controller decides the mode per session.
        batch: {
          createSink: () => createCaptureAudioSink(),
          transcribe: (audio, input) =>
            transcribeCapturedAudio(audio, {
              language: input.language,
              startedAtMs: input.startedAtMs,
              onProgress: input.onProgress,
              signal: input.signal,
            }),
        },
      }),
  );
  const capture = useSyncExternalStore(
    captureController.subscribe,
    captureController.getSnapshot,
  );
  const voiceActive = capture.state !== "idle" && capture.state !== "error";
  const [now, setNow] = useState(Date.now());
  // Uploads read the latest draft through a ref: the async chain would
  // otherwise insert into a stale closure while the user keeps typing.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const pendingUploadsRef = useRef(0);
  const uploadChainRef = useRef<Promise<void>>(Promise.resolve());
  // Inline markdown per preuploaded attachment, so a content edit can tell
  // which references were deleted and prune the bind list (otherwise a
  // deleted image would be re-bound on submit).
  const preuploadMarkdownRef = useRef(new Map<string, string>());

  // Pasted/dropped images show an inline "uploading…" chip immediately, then
  // their references land where the chip sits once the upload settles. Tasks
  // chain so two rapid pastes never interleave.
  const enqueueInlineUploads = (files: File[], position: number) => {
    if (files.length === 0) return;
    pendingUploadsRef.current += files.length;
    setIsUploadingImages(true);
    uploadChainRef.current = uploadChainRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          await uploadAndInsertImages({
            editorRef,
            files,
            position,
            upload: (file) => uploadAttachment({ file }),
            onUploaded: (attachment, markdown) => {
              preuploadMarkdownRef.current.set(attachment.name, markdown);
              commitDraft({
                preuploadedAttachmentNames: [
                  ...(draftRef.current.preuploadedAttachmentNames ?? []),
                  attachment.name,
                ],
              });
            },
            onError: () => toast.error(t("composer.imageUploadFailed")),
          });
        } finally {
          // A failed batch also releases the files skipped after the failure.
          pendingUploadsRef.current -= files.length;
          setIsUploadingImages(pendingUploadsRef.current > 0);
        }
      });
  };

  // All edits rebuild from draftRef, not the render-time prop: an inline
  // upload chain can land between the render and this event, and building
  // from the old prop would silently drop the chain's inserted markdown.
  const commitDraft = (patch: Partial<MemoCaptureInput>) => {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    onDraftChange(next);
  };
  const updateContent = (content: string) => {
    // Drop preuploaded entries whose inline reference was deleted, so sending
    // never re-binds an image the author removed from the text.
    const kept = draftRef.current.preuploadedAttachmentNames?.filter((name) => {
      const markdown = preuploadMarkdownRef.current.get(name);
      // Names without a tracked markdown (restored drafts) stay bound.
      return !markdown || content.includes(markdown);
    });
    commitDraft({
      content,
      tags: extractTags(content),
      preuploadedAttachmentNames: kept,
    });
  };
  const submit = async () => {
    // Images still uploading have no reference in the content yet; sending
    // now would lose them to the orphan GC. A live voice session belongs to
    // the draft in progress, not to a memo being sent.
    if (!canSubmit || isUploadingImages || voiceActive) {
      return;
    }
    try {
      await onSubmit(draft);
    } catch {
      // The mutation owns user-facing error feedback; keep the draft intact.
    }
  };
  const withEditor = (action: (editor: Editor) => void) => {
    if (isPending) return;
    const editor = editorRef.current;
    if (!editor) return;
    action(editor);
  };

  useEffect(() => {
    if (!voiceActive) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [voiceActive]);
  useEffect(() => () => captureController.dispose(), [captureController]);

  // A finished session flows straight into the draft: review state carries
  // the final sentences, everything else collapses back to idle. The draft
  // writer goes through a ref so the effect never re-runs on every keystroke.
  const updateContentRef = useRef(updateContent);
  updateContentRef.current = updateContent;
  useEffect(() => {
    if (capture.state === "error") {
      if (capture.error) toast.error(t(`capture.${capture.error}`));
      captureController.reset();
      return;
    }
    if (capture.state !== "review") return;
    const text = joinFinalSentences(capture.sentences);
    if (text) {
      const base = draftRef.current.content;
      const separator = base && !base.endsWith("\n") ? " " : "";
      const next = `${base}${separator}${text}`;
      updateContentRef.current(next);
    }
    captureController.reset();
  }, [capture.state, capture.sentences, capture.error, captureController, t]);

  const tagSuggestions =
    tags && activeTagToken
      ? filterTagSuggestions(tags, activeTagToken.text)
      : [];
  const showTagSuggestions = tagSuggestions.length > 0 && !isPending;

  const acceptTagSuggestion = (name: string) => {
    if (!activeTagToken) return;
    const editor = editorRef.current;
    if (!editor) return;
    const caret = activeTagToken.from + 1 + activeTagToken.text.length;
    editor
      .chain()
      .focus()
      .insertContentAt(
        { from: activeTagToken.from, to: caret },
        { type: "text", text: `#${name} ` },
      )
      .run();
  };

  return (
    <form
      className="group relative flex w-full flex-col rounded-xl border border-border bg-card shadow-xs motion-safe:animate-rise motion-safe:transition-[border-color,box-shadow] motion-safe:duration-200 focus-within:border-brand-400/60 focus-within:shadow-md focus-within:ring-2 focus-within:ring-brand-400/25"
      data-compact={isCompact ? "true" : undefined}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsComposerFocused(false);
        }
      }}
      onFocus={() => setIsComposerFocused(true)}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Suspense fallback={<ComposerEditorSkeleton />}>
        <RichComposerEditor
          ariaLabel={t("composer.ariaLabel")}
          content={draft.content}
          disabled={isPending}
          editorRef={editorRef}
          onContentChange={updateContent}
          onImageFiles={enqueueInlineUploads}
          onTagTokenChange={tags ? setActiveTagToken : undefined}
          onSubmitRequest={() => {
            if (!isUploadingImages && !voiceActive) void submit();
          }}
          placeholder={t("composer.placeholder")}
        />
      </Suspense>
      {voiceActive && (
        <div className="absolute inset-x-4 bottom-12 z-30 flex items-center gap-3 rounded-lg border border-border bg-popover px-3 py-2.5 shadow-md motion-safe:animate-rise">
          {capture.state === "recording" || capture.state === "reconnecting" ? (
            <>
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full bg-red-500 motion-safe:animate-pulse"
              />
              <span className="shrink-0 font-mono text-sm tabular-nums">
                {formatVoiceClock(
                  capture.startedAt
                    ? Math.max(
                        0,
                        Math.floor(
                          ((capture.stoppedAt ?? now) - capture.startedAt) /
                            1000,
                        ),
                      )
                    : 0,
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {capture.partial || t("capture.recording")}
              </span>
            </>
          ) : (
            <>
              <Loader2Icon
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground motion-safe:animate-spin"
              />
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {capture.state === "requesting_permission"
                  ? t("capture.requestingPermission")
                  : capture.state === "connecting"
                    ? t("capture.connecting")
                    : capture.state === "paused"
                      ? t("capture.paused")
                      : capture.state === "transcribing"
                        ? capture.transcribing
                          ? t("capture.transcribingCount", {
                              done: capture.transcribing.done,
                              total: capture.transcribing.total,
                            })
                          : t("capture.transcribing")
                        : t("capture.stopping")}
              </span>
            </>
          )}
          {capture.state !== "stopping" && capture.state !== "transcribing" && (
            <Button
              className="h-8 shrink-0 px-2.5 text-xs"
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => captureController.reset()}
            >
              {t("composer.voiceCancel")}
            </Button>
          )}
          {capture.state !== "stopping" && capture.state !== "transcribing" && (
            <Button
              className="h-8 shrink-0 px-2.5 text-xs"
              size="sm"
              type="button"
              variant="brand"
              onClick={() => void captureController.stop()}
            >
              {t("composer.voiceStop")}
            </Button>
          )}
        </div>
      )}
      {showTagSuggestions && (
        <div
          className="absolute inset-x-4 bottom-12 z-30 max-h-56 overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-md motion-safe:animate-rise"
          data-testid="composer-tag-suggestions"
        >
          {tagSuggestions.map((suggestion) => (
            <button
              className="flex w-full items-center justify-between gap-3 rounded-md px-3.5 py-1.5 text-left text-sm text-muted-foreground motion-safe:transition-colors hover:bg-muted/60 hover:text-foreground"
              key={suggestion.name}
              type="button"
              onMouseDown={(event) => {
                // Keep editor focus/selection so the rewritten caret lands.
                event.preventDefault();
                acceptTagSuggestion(suggestion.name);
              }}
            >
              <span className="truncate">
                <span className="text-muted-foreground">#</span>
                {suggestion.name}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {suggestion.count}
              </span>
            </button>
          ))}
        </div>
      )}
      {draft.files.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {draft.files.map((file) => (
            <div
              className="flex max-w-full items-center gap-2 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
              key={getFileKey(file)}
            >
              <PaperclipIcon />
              <span className="truncate">{file.name}</span>
              <Button
                aria-label={t("composer.removeFile", { filename: file.name })}
                disabled={isPending}
                size="icon-xs"
                type="button"
                variant="ghost"
                onClick={() =>
                  commitDraft({
                    files: draftRef.current.files.filter(
                      (item) => item !== file,
                    ),
                  })
                }
              >
                <XIcon />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex h-10 items-center justify-between gap-2 rounded-b-xl bg-card px-3 pb-1">
        <div className="flex min-w-0 items-center gap-1">
          <Button
            aria-label={t("composer.addTag")}
            disabled={isPending}
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={() =>
              withEditor((editor) => {
                editor
                  .chain()
                  .focus()
                  .insertContentAt(editor.state.selection.to, "#")
                  .run();
              })
            }
          >
            <HashIcon />
          </Button>
          <Button
            render={
              <label
                aria-label={t("composer.addAttachment")}
                htmlFor="flaremo-attachment-input"
              />
            }
            disabled={isPending}
            size="icon-sm"
            variant="ghost"
          >
            <ImageIcon />
            <Input
              className="hidden"
              id="flaremo-attachment-input"
              multiple
              type="file"
              disabled={isPending}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                if (files.length === 0) return;
                onDraftChange({
                  ...draft,
                  files: [...draft.files, ...files],
                });
              }}
            />
          </Button>
          <div className="hidden h-4 w-px bg-border sm:block" />
          <Button
            aria-label={t("composer.bulletList")}
            disabled={isPending}
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={() =>
              withEditor((editor) => {
                editor.chain().focus().toggleBulletList().run();
              })
            }
          >
            <ListIcon />
          </Button>
          <Button
            aria-label={t("composer.orderedList")}
            disabled={isPending}
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={() =>
              withEditor((editor) => {
                editor.chain().focus().toggleOrderedList().run();
              })
            }
          >
            <ListOrderedIcon />
          </Button>
          <Button
            aria-label={t("composer.taskList")}
            disabled={isPending}
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={() =>
              withEditor((editor) => {
                editor.chain().focus().toggleTaskList().run();
              })
            }
          >
            <CheckSquareIcon />
          </Button>
          <Button
            aria-label={t("composer.insertDate")}
            disabled={isPending}
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={() =>
              withEditor((editor) => {
                const today = new Date().toISOString().slice(0, 10);
                editor.chain().focus().insertContent(`${today} `).run();
              })
            }
            title={t("composer.insertDate")}
          >
            <CalendarPlusIcon />
          </Button>
          {captureAvailable && (
            <Button
              aria-label={t("composer.voice")}
              className={voiceActive ? "text-brand-600" : undefined}
              disabled={isPending}
              size="icon-sm"
              type="button"
              variant="ghost"
              onClick={() => {
                if (voiceActive) return;
                void captureController.start();
              }}
            >
              <MicIcon />
            </Button>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 self-center">
          {showVisibility && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    aria-label={t("composer.visibility.aria")}
                    className="h-7 gap-1 rounded-full border-border bg-card px-2.5 text-xs"
                    disabled={isPending}
                    size="sm"
                    type="button"
                    variant="outline"
                  />
                }
              >
                {draft.visibility === "protected" ? (
                  <UsersIcon data-icon="inline-start" />
                ) : (
                  <LockIcon data-icon="inline-start" />
                )}
                <span>
                  {draft.visibility === "protected"
                    ? t("composer.visibility.team")
                    : t("composer.visibility.personal")}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    if (draft.visibility === "protected") return;
                    commitDraft({ visibility: "private" });
                    onVisibilityChange?.("private");
                  }}
                >
                  <LockIcon />
                  {t("composer.visibility.personal")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    if (draft.visibility !== "protected") return;
                    commitDraft({ visibility: "protected" });
                    onVisibilityChange?.("protected");
                  }}
                >
                  <UsersIcon />
                  {t("composer.visibility.team")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {/* flomo's round send: the icon is the affordance, the label lives
              in the aria name. */}
          <Button
            aria-label={t("composer.send")}
            className="size-8 rounded-full"
            disabled={
              isPending || isUploadingImages || !canSubmit || voiceActive
            }
            size="icon-sm"
            type="submit"
            variant="brand"
          >
            {isPending ? (
              <Loader2Icon className="motion-safe:animate-spin" />
            ) : (
              <SendIcon className="motion-safe:animate-scale-in" />
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
