import {
  getAudioCompressionEnabled,
  getImageCompressionEnabled,
} from "./upload-settings";

/**
 * Best-effort client-side transcode before upload
 * (docs/image-compression-design.md, docs/audio-compression-research.md).
 * Compression is decoration, never a contract: every failure path returns
 * the original file untouched, and a transcode that does not actually shrink
 * the payload is discarded. Audio additionally refuses to transcode when the
 * browser cannot play Ogg Opus back, or when the decoded PCM would exceed the
 * memory budget — an unplayable or tab-killing attachment is worse than a
 * large one.
 */

const MIN_COMPRESSIBLE_IMAGE_BYTES = 100 * 1024;
const MAX_LONG_EDGE = 2560;
// iOS Safari silently fails (blank canvas) above this area; stay below it.
const MAX_CANVAS_AREA = 16_000_000;
const WEBP_QUALITY = 0.82;
// A 2560px encode is normally well under a second even on a slow phone; this
// only exists so a missing toBlob callback cannot stall the upload forever.
const WEBP_ENCODE_TIMEOUT_MS = 10_000;

const SKIP_IMAGE_TYPES = new Set([
  "image/gif", // canvas drops animation frames
  "image/svg+xml", // rasterizing destroys the vector
  "image/webp", // already the target format
  "image/avif", // already more efficient than WebP
]);

/** Uncompressed/lossless audio is worth transcoding; lossy sources are not. */
const LOSSLESS_AUDIO_TYPES = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/vnd.wave",
  "audio/flac",
  "audio/x-flac",
  "audio/aiff",
  "audio/x-aiff",
]);

const LOSSLESS_AUDIO_EXTENSIONS = /\.(wav|wave|aif|aiff|aifc|flac)$/;

// decodeAudioData resamples to the context rate, so a low-rate source can be
// decoded at its own rate: a 16 kHz mono recording then costs a third of what
// a 48 kHz decode would, and the encoder upsamples to 48 kHz internally.
const AUDIO_SAMPLE_RATE = 48_000;
const AUDIO_RATE_MIN = 8_000;
const AUDIO_RATE_MAX = 48_000;
// One second of source audio per encode call. The package buffers partial Opus
// frames internally, so this costs nothing in output size (measured identical),
// and it keeps the resampler exact: one second of any rate maps to 48000
// samples, where 20 ms chunks let the per-call rounding accumulate (measured
// 0.018% short over 10 s at 11025 Hz). It also cuts the resampler's
// chunk-edge discontinuities from 50/s to 1/s.
const AUDIO_CHUNK_SECONDS = 1;
const AUDIO_BITRATE_STEREO_KBPS = 96;
const AUDIO_BITRATE_MONO_KBPS = 32;
// Decoded PCM is Float32 — 4 bytes per sample per channel. A 25 MiB 8 kHz mono
// WAV (54 minutes) would decode to ~105 MB and take a mobile tab down, so past
// this budget the transcode is skipped and the original file is uploaded.
const MAX_DECODED_AUDIO_BYTES = 96 * 1024 * 1024;
// Unparseable header: assume the least efficient container worth compressing
// (8 kHz mono, 1 byte per sample) rather than trusting the file size.
const UNKNOWN_AUDIO_BYTES_FACTOR = 6;
// One Opus frame (20 ms at 48 kHz) — the unit the encoder requires per call.
const AUDIO_OPUS_FRAME_SAMPLES = 960;

function withExtension(name: string, extension: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}.${extension}`;
}

export function shouldCompressImage(file: File): boolean {
  const type = file.type.toLowerCase();
  if (!type.startsWith("image/")) return false;
  if (SKIP_IMAGE_TYPES.has(type)) return false;
  if (file.size < MIN_COMPRESSIBLE_IMAGE_BYTES) return false;
  return true;
}

export function shouldCompressAudio(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type === "") {
    // Some pickers hand over extension-only files.
    return LOSSLESS_AUDIO_EXTENSIONS.test(file.name.toLowerCase());
  }
  return LOSSLESS_AUDIO_TYPES.has(type);
}

type AudioFormat = {
  sampleRate: number;
  channels: number;
  totalSamples: number;
};

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let text = "";
  const end = Math.min(offset + length, bytes.byteLength);
  for (let index = Math.max(0, offset); index < end; index += 1) {
    text += String.fromCharCode(bytes[index]);
  }
  return text;
}

/**
 * Walks RIFF/AIFF chunks (4-byte id, 4-byte size, even-padded payload). A
 * chunk claiming more bytes than the file holds ends the walk, so a truncated
 * or lying header cannot spin here.
 */
function* readChunks(bytes: Uint8Array, start: number, littleEndian: boolean) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = start;
  while (offset + 8 <= bytes.byteLength) {
    const size = view.getUint32(offset + 4, littleEndian);
    const body = offset + 8;
    yield { id: readAscii(bytes, offset, 4), body, size };
    if (size > bytes.byteLength) return;
    offset = body + size + (size % 2);
  }
}

function parseWav(bytes: Uint8Array): AudioFormat | undefined {
  if (readAscii(bytes, 8, 4) !== "WAVE") return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let sampleRate = 0;
  let channels = 0;
  let blockAlign = 0;
  let dataBytes = 0;
  for (const chunk of readChunks(bytes, 12, true)) {
    if (
      chunk.id === "fmt " &&
      chunk.size >= 16 &&
      chunk.body + 16 <= bytes.byteLength
    ) {
      channels = view.getUint16(chunk.body + 2, true);
      sampleRate = view.getUint32(chunk.body + 4, true);
      blockAlign = view.getUint16(chunk.body + 12, true);
    } else if (chunk.id === "data") {
      // Streaming writers leave the size at 0 or 0xffffffff; fall back to the
      // bytes actually present.
      dataBytes =
        chunk.size > 0 &&
        chunk.size !== 0xffffffff &&
        chunk.body + chunk.size <= bytes.byteLength
          ? chunk.size
          : bytes.byteLength - chunk.body;
    }
  }
  const frameBytes = blockAlign > 0 ? blockAlign : channels * 2;
  if (!sampleRate || !channels || !dataBytes) return undefined;
  return {
    sampleRate,
    channels,
    totalSamples: Math.floor(dataBytes / frameBytes),
  };
}

/** 80-bit IEEE 754 extended float — the AIFF sample rate encoding. */
function readExtended80(bytes: Uint8Array, offset: number): number {
  if (offset + 10 > bytes.byteLength) return 0;
  const exponent = ((bytes[offset] & 0x7f) << 8) | bytes[offset + 1];
  let mantissa = 0;
  for (let index = 2; index < 10; index += 1) {
    mantissa = mantissa * 256 + bytes[offset + index];
  }
  if (!exponent || !mantissa) return 0;
  return mantissa * 2 ** (exponent - 16383 - 63);
}

function parseAiff(bytes: Uint8Array): AudioFormat | undefined {
  const form = readAscii(bytes, 8, 4);
  if (form !== "AIFF" && form !== "AIFC") return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (const chunk of readChunks(bytes, 12, false)) {
    if (
      chunk.id !== "COMM" ||
      chunk.size < 18 ||
      chunk.body + 18 > bytes.byteLength
    ) {
      continue;
    }
    const channels = view.getUint16(chunk.body, false);
    const totalSamples = view.getUint32(chunk.body + 2, false);
    const sampleRate = readExtended80(bytes, chunk.body + 8);
    if (!channels || !totalSamples || !sampleRate) return undefined;
    return { sampleRate, channels, totalSamples };
  }
  return undefined;
}

function parseFlac(bytes: Uint8Array): AudioFormat | undefined {
  // STREAMINFO is mandatory and always the first metadata block (34 bytes).
  if (bytes.byteLength < 8 + 34 || (bytes[4] & 0x7f) !== 0) return undefined;
  const byte = (index: number) => bytes[8 + index];
  const sampleRate = (byte(10) << 12) | (byte(11) << 4) | (byte(12) >> 4);
  const channels = ((byte(12) >> 1) & 0x07) + 1;
  const totalSamples =
    (byte(13) & 0x0f) * 2 ** 32 +
    ((byte(14) << 24) | (byte(15) << 16) | (byte(16) << 8) | byte(17));
  if (!sampleRate || !channels) return undefined;
  return { sampleRate, channels, totalSamples };
}

function readAudioFormat(bytes: Uint8Array): AudioFormat | undefined {
  switch (readAscii(bytes, 0, 4)) {
    case "RIFF":
    case "RF64":
      return parseWav(bytes);
    case "FORM":
      return parseAiff(bytes);
    case "fLaC":
      return parseFlac(bytes);
    default:
      return undefined;
  }
}

function audioContextRate(sampleRate: number): number {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) return AUDIO_SAMPLE_RATE;
  return Math.min(
    Math.max(Math.round(sampleRate), AUDIO_RATE_MIN),
    AUDIO_RATE_MAX,
  );
}

function estimateDecodedBytes(
  fileBytes: number,
  format: AudioFormat | undefined,
  contextRate: number,
): number {
  if (!format || format.totalSamples <= 0) {
    return fileBytes * UNKNOWN_AUDIO_BYTES_FACTOR;
  }
  const rateScale = Math.max(1, contextRate / format.sampleRate);
  return format.totalSamples * rateScale * format.channels * 4;
}

/**
 * Proves this browser can actually decode Ogg Opus before any attachment is
 * transcoded into it. Ogg Opus playback only reached Safari 18.4 / iOS 18.4
 * (macOS 15.4), and a transcode the uploading device cannot play back is worse
 * than a large file.
 *
 * The proof decodes a real stream from this very encoder rather than a
 * capability string: canPlayType has a documented history of answering
 * optimistically for Ogg (WebKit returned "probably" for a container it could
 * not demux), and it also has false negatives on Safari. A prefix of some
 * larger payload is no good either — browsers disagree about truncated Ogg, so
 * that would prove nothing. One 20 ms silence frame plus the flush is a
 * complete ~225-byte file; the frame is what makes it decodable, since a
 * headers-and-EOS-only stream is rejected by real decoders (both verified
 * against Chromium while implementing this).
 */
async function canDecodeOggOpus(): Promise<boolean> {
  try {
    const { default: createOpus } = await import("@audio/encode-opus");
    const encoder = await createOpus({
      sampleRate: AUDIO_SAMPLE_RATE,
      channels: 1,
      bitrate: AUDIO_BITRATE_MONO_KBPS,
      application: "voip",
    });
    let stream: Uint8Array<ArrayBuffer> | null = null;
    try {
      const frame = encoder.encode([
        new Float32Array(AUDIO_OPUS_FRAME_SAMPLES),
      ]);
      const tail = encoder.flush();
      const joined = new Uint8Array(frame.byteLength + tail.byteLength);
      joined.set(frame);
      joined.set(tail, frame.byteLength);
      stream = joined;
    } finally {
      encoder.free();
    }
    if (!stream) return false;
    await new OfflineAudioContext(1, 1, AUDIO_SAMPLE_RATE).decodeAudioData(
      stream.buffer,
    );
    return true;
  } catch {
    return false;
  }
}

function supportsWebpEncode(): boolean {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

type DrawableSource = ImageBitmap | HTMLImageElement | HTMLCanvasElement;

/**
 * Releases what a decoded source holds: bitmaps are closed, and the object URL
 * behind an <img> is revoked only here — revoking it at decode time would pull
 * the bytes out from under a later drawImage on engines that drop decoded
 * image data under memory pressure.
 */
function releaseSource(source: DrawableSource): void {
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    source.close();
    return;
  }
  const src = (source as HTMLImageElement).src;
  if (typeof src === "string" && src.startsWith("blob:")) {
    URL.revokeObjectURL(src);
  }
}

async function decodeOriented(file: File): Promise<DrawableSource> {
  const url = URL.createObjectURL(file);
  try {
    // <img> is the EXIF-safe decode path: every modern browser bakes the
    // orientation in when an <img> is drawn to canvas.
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } catch {
    URL.revokeObjectURL(url);
    // decode() can fail where createImageBitmap still succeeds (e.g. some
    // Workers/legacy contexts); orientation support there is best-effort.
    return createImageBitmap(file, { imageOrientation: "from-image" });
  }
}

function sourceDimensions(source: DrawableSource): {
  width: number;
  height: number;
} {
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    return { width: source.width, height: source.height };
  }
  const image = source as HTMLImageElement;
  return {
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
  };
}

function drawScaled(
  source: DrawableSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): HTMLCanvasElement | null {
  let current: DrawableSource = source;
  let currentWidth = sourceWidth;
  let currentHeight = sourceHeight;

  // Step down by halves for quality. Every intermediate canvas must stay
  // under the iOS area limit; past that, jump straight to the final size —
  // the source (bitmap/img) itself has no canvas limit.
  while (currentWidth > targetWidth * 2 && currentHeight > targetHeight * 2) {
    const nextWidth = Math.max(targetWidth, Math.floor(currentWidth / 2));
    const nextHeight = Math.max(targetHeight, Math.floor(currentHeight / 2));
    if (nextWidth * nextHeight > MAX_CANVAS_AREA) break;
    const canvas = document.createElement("canvas");
    canvas.width = nextWidth;
    canvas.height = nextHeight;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.imageSmoothingEnabled = true;
    context.drawImage(
      current,
      0,
      0,
      currentWidth,
      currentHeight,
      0,
      0,
      nextWidth,
      nextHeight,
    );
    current = canvas;
    currentWidth = nextWidth;
    currentHeight = nextHeight;
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.imageSmoothingEnabled = true;
  context.drawImage(
    current,
    0,
    0,
    currentWidth,
    currentHeight,
    0,
    0,
    targetWidth,
    targetHeight,
  );
  return canvas;
}

function canvasToWebpBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (blob: Blob | null) => {
      if (settled) return;
      settled = true;
      resolve(blob);
    };
    // Safari can drop the callback entirely (tainted canvas, context loss).
    // Without this timer the awaited upload would never start at all.
    const timer = setTimeout(() => settle(null), WEBP_ENCODE_TIMEOUT_MS);
    try {
      canvas.toBlob(
        (blob) => {
          clearTimeout(timer);
          settle(blob);
        },
        "image/webp",
        WEBP_QUALITY,
      );
    } catch {
      clearTimeout(timer);
      settle(null);
    }
  });
}

/**
 * Returns a WebP File, or null when the input should be uploaded as-is
 * (skip rules, unsupported browser, encode failure, or no size win).
 */
export async function compressImage(file: File): Promise<File | null> {
  if (!shouldCompressImage(file)) return null;
  if (!supportsWebpEncode()) return null;
  const source = await decodeOriented(file).catch(() => null);
  if (!source) return null;
  try {
    const { width, height } = sourceDimensions(source);
    if (!width || !height) return null;
    const scale = Math.min(1, MAX_LONG_EDGE / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const canvas = drawScaled(source, width, height, targetWidth, targetHeight);
    if (!canvas) return null;
    const blob = await canvasToWebpBlob(canvas);
    if (!blob || blob.size >= file.size) return null;
    return new File([blob], withExtension(file.name, "webp"), {
      type: "image/webp",
    });
  } catch {
    return null;
  } finally {
    releaseSource(source);
  }
}

/**
 * Returns an Ogg Opus File, or null when the input should be uploaded as-is
 * (lossy sources, decode/encode failure, or no size win).
 */
export async function compressAudio(file: File): Promise<File | null> {
  if (!shouldCompressAudio(file)) return null;
  // Cheapest gate first: no point decoding a large file into a format this
  // browser cannot play back.
  if (!(await canDecodeOggOpus())) return null;
  try {
    const data = await file.arrayBuffer();
    const format = readAudioFormat(new Uint8Array(data));
    const contextRate = format
      ? audioContextRate(format.sampleRate)
      : AUDIO_SAMPLE_RATE;
    if (
      estimateDecodedBytes(file.size, format, contextRate) >
      MAX_DECODED_AUDIO_BYTES
    ) {
      return null;
    }

    const buffer = await new OfflineAudioContext(
      1,
      1,
      contextRate,
    ).decodeAudioData(data);
    // Nothing decoded: the encoder would emit headers and an EOS page with no
    // audio frame, which real decoders reject (see canDecodeOggOpus). Upload
    // the original instead of a file no browser can play.
    if (!buffer.length) return null;
    const channels = Math.min(2, Math.max(1, buffer.numberOfChannels));
    const channelData: Float32Array[] = [];
    for (let index = 0; index < channels; index += 1) {
      channelData.push(buffer.getChannelData(index));
    }

    const { default: createOpus } = await import("@audio/encode-opus");
    const encoder = await createOpus({
      sampleRate: contextRate,
      channels,
      bitrate:
        channels === 2 ? AUDIO_BITRATE_STEREO_KBPS : AUDIO_BITRATE_MONO_KBPS,
      application: channels === 2 ? "audio" : "voip",
    });
    const chunkSamples = Math.max(
      1,
      Math.round(contextRate * AUDIO_CHUNK_SECONDS),
    );
    const chunks: BlobPart[] = [];
    try {
      for (let offset = 0; offset < buffer.length; offset += chunkSamples) {
        const end = Math.min(offset + chunkSamples, buffer.length);
        // Copy out: BlobPart typing aside, the copy detaches each chunk from
        // any buffer the encoder might hand back.
        chunks.push(
          new Uint8Array(
            encoder.encode(
              channelData.map((data) => data.subarray(offset, end)),
            ),
          ),
        );
      }
      chunks.push(new Uint8Array(encoder.flush()));
    } finally {
      encoder.free();
    }

    const blob = new Blob(chunks, { type: "audio/ogg" });
    if (blob.size >= file.size) return null;
    return new File([blob], withExtension(file.name, "ogg"), {
      type: "audio/ogg",
    });
  } catch {
    return null;
  }
}

/**
 * The single hook-in for uploadAttachment: consults the settings switches
 * and returns the file to actually upload. Never throws; every branch
 * degrades to the input file.
 */
export async function prepareUploadFile(file: File): Promise<File> {
  let current = file;
  if (getImageCompressionEnabled()) {
    current = (await compressImage(current)) ?? current;
  }
  if (getAudioCompressionEnabled()) {
    current = (await compressAudio(current)) ?? current;
  }
  return current;
}
