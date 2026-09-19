import { useEffect, useMemo, useRef } from "react";
import type { Attachment } from "@/api";
import { AttachmentGallery } from "@/components/attachment-gallery";
import { LazyMemoContent } from "@/components/lazy-memo-content";
import { MemoOutline } from "@/components/reading/memo-outline";
import { ReadingAudioBar } from "@/components/reading/reading-audio-bar";
import {
  ReadingAudioProvider,
  useReadingAudio,
} from "@/components/reading/reading-audio-provider";
import {
  createImageDimensionResolver,
  filterUnreferencedAttachments,
} from "@/lib/attachment-refs";
import { cn } from "@/lib/utils";

export type ReadingViewProps = {
  attachments: Attachment[];
  className?: string;
  /** Applied to the memo body itself, so callers keep their type scale. */
  contentClassName?: string;
  content: string;
  /**
   * `card` keeps the compact timeline treatment; `article` adds the outline and
   * the audio transport.
   */
  layout?: "card" | "article";
  /** D2: live GFM checkboxes; see MemoContent. */
  onToggleTask?: (lineIndex: number, checked: boolean) => void;
  onConvertTask?: (lineIndex: number, text: string) => void;
};

function isAudio(attachment: Attachment) {
  return Boolean(attachment.content_type?.startsWith("audio/"));
}

function MemoAudioTracks(attachments: Attachment[]) {
  return attachments.filter(isAudio).map((attachment) => ({
    id: attachment.name,
    filename: attachment.filename,
    src: attachment.preview_url,
    downloadUrl: attachment.download_url,
    sizeBytes: attachment.size,
    durationSeconds:
      typeof attachment.payload?.duration === "number"
        ? attachment.payload.duration
        : undefined,
    contentType: attachment.content_type,
  }));
}

/**
 * Marks the paragraph covering the current playback position and, with
 * follow enabled, keeps it in view. Driven by a DOM effect on each tick rather
 * than React state: a transcript can hold tens of thousands of characters, and
 * re-rendering it every second would jank. The effect only re-subscribes when
 * follow or enabled-ness changes — `subscribeTime` is a stable callback, so
 * playback ticks never rebuild it.
 */
function useParagraphHighlight(
  containerRef: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
) {
  const audio = useReadingAudio();
  const follow = audio?.follow ?? false;
  const subscribeTime = audio?.subscribeTime;
  // Snapshot for the initial apply; excluded from deps so playback ticks do
  // not re-run the effect (the subscription covers those).
  const initialTimeRef = useRef(0);
  initialTimeRef.current = audio?.currentTime ?? 0;

  useEffect(() => {
    if (!enabled || !subscribeTime) return;
    const container = containerRef.current;
    if (!container) return;

    let highlighted: HTMLElement | null = null;
    // Cache the cue list once per effect lifetime: re-querying and sorting
    // the DOM on every playback tick was O(n log n) per tick for long
    // transcripts. Cue elements are static for the container's lifetime.
    let cachedCues: { element: HTMLElement; at: number }[] | null = null;
    const cues = () => {
      if (!cachedCues) {
        cachedCues = Array.from(
          container.querySelectorAll<HTMLElement>("[data-flaremo-t]"),
        )
          .map((element) => ({
            element,
            at: Number(element.dataset.flaremoT) || 0,
          }))
          .sort((a, b) => a.at - b.at);
      }
      return cachedCues;
    };
    const apply = (seconds: number) => {
      let active: HTMLElement | null = null;
      for (const cue of cues()) {
        if (cue.at <= seconds) active = cue.element;
        else break;
      }

      const paragraph = active?.closest("p") ?? null;
      if (paragraph === highlighted) return;
      highlighted?.classList.remove("memo-transcript-active");
      paragraph?.classList.add("memo-transcript-active");
      highlighted = paragraph;
      if (follow && paragraph) {
        const reducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        paragraph.scrollIntoView({
          behavior: reducedMotion ? "auto" : "smooth",
          block: "center",
        });
      }
    };

    apply(initialTimeRef.current);
    return subscribeTime(apply);
  }, [containerRef, enabled, follow, subscribeTime]);
}

function ArticleReadingView({
  attachments,
  className,
  content,
  contentClassName,
  onToggleTask,
  onConvertTask,
  resolveImageDimensions,
  hasAudio,
}: Required<Pick<ReadingViewProps, "attachments" | "content">> &
  Pick<
    ReadingViewProps,
    "className" | "contentClassName" | "onToggleTask" | "onConvertTask"
  > & {
    resolveImageDimensions: (
      src: string,
    ) => { width: number; height: number } | undefined;
    /** Audio reading adds the sticky transport + transcript highlight. */
    hasAudio: boolean;
  }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const audio = useReadingAudio();
  useParagraphHighlight(bodyRef, hasAudio && Boolean(audio?.track));

  // Audio rides in the sticky bar and body-referenced images render inline,
  // so the gallery keeps only the files the body does not already show.
  const nonAudio = attachments.filter((item) => !isAudio(item));
  const galleryAttachments = filterUnreferencedAttachments(nonAudio, content);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {hasAudio && <ReadingAudioBar />}
      {/* Stacked on narrow screens (outline collapsed above the body), two
          columns from lg up. The width classes are lg-scoped so the mobile
          outline takes the full row instead of squeezing the transcript. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
        {/* The outline is article-layout equipment, not audio equipment:
            any piece with ≥2 headings gets a TOC (MemoOutline hides itself
            below that threshold). */}
        <MemoOutline
          className="lg:order-2 lg:w-44 lg:shrink-0"
          content={content}
        />
        <div
          className="flex min-w-0 flex-1 flex-col gap-4 lg:order-1"
          ref={bodyRef}
        >
          <LazyMemoContent
            className={contentClassName}
            content={content}
            onTimestampClick={hasAudio ? audio?.seek : undefined}
            resolveImageDimensions={resolveImageDimensions}
            withHeadingIds
            onToggleTask={onToggleTask}
            onConvertTask={onConvertTask}
          />
          {galleryAttachments.length > 0 && (
            <AttachmentGallery attachments={galleryAttachments} />
          )}
        </div>
      </div>
    </div>
  );
}

function PlainReadingView({
  attachments,
  className,
  content,
  contentClassName,
  onToggleTask,
  onConvertTask,
  resolveImageDimensions,
}: Required<Pick<ReadingViewProps, "attachments" | "content">> &
  Pick<
    ReadingViewProps,
    "className" | "contentClassName" | "onToggleTask" | "onConvertTask"
  > & {
    resolveImageDimensions: (
      src: string,
    ) => { width: number; height: number } | undefined;
  }) {
  const galleryAttachments = filterUnreferencedAttachments(
    attachments,
    content,
  );
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <LazyMemoContent
        className={contentClassName}
        content={content}
        resolveImageDimensions={resolveImageDimensions}
        onToggleTask={onToggleTask}
        onConvertTask={onConvertTask}
      />
      {galleryAttachments.length > 0 && (
        <AttachmentGallery attachments={galleryAttachments} />
      )}
    </div>
  );
}

/**
 * One reading surface for every memo entry point. Audio memos get the sticky
 * transport and an outline; everything else renders as it did before.
 */
export function MemoReadingView({
  attachments,
  className,
  content,
  contentClassName,
  layout = "article",
  onToggleTask,
  onConvertTask,
}: ReadingViewProps) {
  // Stable identity across renders: the provider keys restore/save effects on
  // the active track object.
  const tracks = useMemo(() => MemoAudioTracks(attachments), [attachments]);
  const resolveImageDimensions = useMemo(
    () => createImageDimensionResolver(attachments),
    [attachments],
  );

  if (layout === "article") {
    const readingView = (
      <ArticleReadingView
        attachments={attachments}
        className={className}
        content={content}
        contentClassName={contentClassName}
        hasAudio={tracks.length > 0}
        resolveImageDimensions={resolveImageDimensions}
        onToggleTask={onToggleTask}
        onConvertTask={onConvertTask}
      />
    );
    // Audio articles additionally get the transport provider (seek/follow);
    // text articles share the same outline + body treatment without one.
    return tracks.length > 0 ? (
      <ReadingAudioProvider tracks={tracks}>{readingView}</ReadingAudioProvider>
    ) : (
      readingView
    );
  }

  return (
    <PlainReadingView
      attachments={attachments}
      className={className}
      content={content}
      contentClassName={contentClassName}
      resolveImageDimensions={resolveImageDimensions}
      onToggleTask={onToggleTask}
      onConvertTask={onConvertTask}
    />
  );
}
