/**
 * Upload preferences persisted in localStorage, mirroring the theme/locale
 * pattern: per-browser, no server round-trip. Compression defaults to on;
 * the settings dialog exposes independent switches for images and audio
 * (docs/image-compression-design.md §4, docs/audio-compression-research.md §6).
 */
const IMAGE_COMPRESSION_KEY = "flaremo.upload.image-compression";
const AUDIO_COMPRESSION_KEY = "flaremo.upload.audio-compression";

function readEnabled(key: string): boolean {
  try {
    return localStorage.getItem(key) !== "0";
  } catch {
    return true;
  }
}

function writeEnabled(key: string, enabled: boolean): void {
  try {
    localStorage.setItem(key, enabled ? "1" : "0");
  } catch {
    // Storage can be unavailable (private mode); uploads re-read on every
    // call so there is no cached state to fall out of sync.
  }
}

export function getImageCompressionEnabled(): boolean {
  return readEnabled(IMAGE_COMPRESSION_KEY);
}

export function setImageCompressionEnabled(enabled: boolean): void {
  writeEnabled(IMAGE_COMPRESSION_KEY, enabled);
}

export function getAudioCompressionEnabled(): boolean {
  return readEnabled(AUDIO_COMPRESSION_KEY);
}

export function setAudioCompressionEnabled(enabled: boolean): void {
  writeEnabled(AUDIO_COMPRESSION_KEY, enabled);
}
