import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  compressAudio,
  compressImage,
  prepareUploadFile,
  shouldCompressAudio,
  shouldCompressImage,
} from "./upload-compression";
import {
  getAudioCompressionEnabled,
  getImageCompressionEnabled,
  setAudioCompressionEnabled,
  setImageCompressionEnabled,
} from "./upload-settings";

const opusMock = vi.hoisted(() => ({
  state: {
    encodeCalls: 0,
    flushCalls: 0,
    freeCalls: 0,
    options: null as Record<string, unknown> | null,
  },
}));

vi.mock("@audio/encode-opus", () => ({
  default: async (options: Record<string, unknown>) => {
    opusMock.state.options = options;
    return {
      encode: () => {
        opusMock.state.encodeCalls += 1;
        return new Uint8Array(4);
      },
      flush: () => {
        opusMock.state.flushCalls += 1;
        return new Uint8Array(4);
      },
      free: () => {
        opusMock.state.freeCalls += 1;
      },
    };
  },
}));

const localStorageStore = new Map<string, string>();

beforeEach(() => {
  localStorageStore.clear();
  opusMock.state.encodeCalls = 0;
  opusMock.state.flushCalls = 0;
  opusMock.state.freeCalls = 0;
  opusMock.state.options = null;
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => localStorageStore.get(key) ?? null,
    setItem: (key: string, value: string) => {
      localStorageStore.set(key, value);
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("upload settings", () => {
  it("defaults both switches to on", () => {
    expect(getImageCompressionEnabled()).toBe(true);
    expect(getAudioCompressionEnabled()).toBe(true);
  });

  it("round-trips the switches independently", () => {
    setImageCompressionEnabled(false);
    expect(getImageCompressionEnabled()).toBe(false);
    expect(getAudioCompressionEnabled()).toBe(true);
    setAudioCompressionEnabled(false);
    expect(getAudioCompressionEnabled()).toBe(false);
    expect(localStorageStore.get("flaremo.upload.image-compression")).toBe("0");
  });
});

describe("shouldCompressImage", () => {
  it("accepts png/jpeg above the size floor", () => {
    expect(
      shouldCompressImage(
        new File([new Uint8Array(150_000)], "a.png", { type: "image/png" }),
      ),
    ).toBe(true);
    expect(
      shouldCompressImage(
        new File([new Uint8Array(150_000)], "a.jpg", { type: "image/jpeg" }),
      ),
    ).toBe(true);
  });

  it("skips small files, animation/vector/already-compressed types and non-images", () => {
    const big = (type: string, name = "a") =>
      new File([new Uint8Array(150_000)], name, { type });
    expect(
      shouldCompressImage(
        new File([new Uint8Array(50_000)], "small.png", { type: "image/png" }),
      ),
    ).toBe(false);
    expect(shouldCompressImage(big("image/gif"))).toBe(false);
    expect(shouldCompressImage(big("image/svg+xml"))).toBe(false);
    expect(shouldCompressImage(big("image/webp"))).toBe(false);
    expect(shouldCompressImage(big("image/avif"))).toBe(false);
    expect(shouldCompressImage(big("text/plain"))).toBe(false);
    expect(
      shouldCompressImage(
        new File([new Uint8Array(150_000)], "a", { type: "" }),
      ),
    ).toBe(false);
  });
});

describe("shouldCompressAudio", () => {
  it("accepts uncompressed and lossless sources", () => {
    expect(
      shouldCompressAudio(
        new File([new Uint8Array(1)], "a.wav", { type: "audio/wav" }),
      ),
    ).toBe(true);
    expect(
      shouldCompressAudio(
        new File([new Uint8Array(1)], "a.wav", { type: "audio/x-wav" }),
      ),
    ).toBe(true);
    expect(
      shouldCompressAudio(
        new File([new Uint8Array(1)], "a.flac", { type: "audio/flac" }),
      ),
    ).toBe(true);
    expect(
      shouldCompressAudio(
        new File([new Uint8Array(1)], "a.aiff", { type: "audio/aiff" }),
      ),
    ).toBe(true);
  });

  it("skips lossy sources regardless of size", () => {
    const file = new File([new Uint8Array(10_000_000)], "a.mp3", {
      type: "audio/mpeg",
    });
    expect(shouldCompressAudio(file)).toBe(false);
    expect(
      shouldCompressAudio(
        new File([new Uint8Array(1)], "a.m4a", { type: "audio/mp4" }),
      ),
    ).toBe(false);
    expect(
      shouldCompressAudio(
        new File([new Uint8Array(1)], "a.ogg", { type: "audio/ogg" }),
      ),
    ).toBe(false);
    expect(
      shouldCompressAudio(
        new File([new Uint8Array(1)], "a.opus", { type: "audio/opus" }),
      ),
    ).toBe(false);
    expect(
      shouldCompressAudio(
        new File([new Uint8Array(1)], "a.webm", { type: "audio/webm" }),
      ),
    ).toBe(false);
  });

  it("falls back to the extension when the type is empty", () => {
    expect(
      shouldCompressAudio(
        new File([new Uint8Array(1)], "clip.flac", { type: "" }),
      ),
    ).toBe(true);
    expect(
      shouldCompressAudio(
        new File([new Uint8Array(1)], "clip.wav", { type: "" }),
      ),
    ).toBe(true);
    expect(
      shouldCompressAudio(
        new File([new Uint8Array(1)], "song.mp3", { type: "" }),
      ),
    ).toBe(false);
    expect(
      shouldCompressAudio(
        new File([new Uint8Array(1)], "note.txt", { type: "" }),
      ),
    ).toBe(false);
  });
});

describe("compressImage", () => {
  function stubCanvas(
    options: { webpSupported?: boolean; blob?: Blob | null } = {},
  ) {
    const {
      webpSupported = true,
      blob = new Blob([new Uint8Array(50_000)], { type: "image/webp" }),
    } = options;
    const created: { width: number; height: number }[] = [];
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:mock",
      revokeObjectURL: () => {},
    });
    vi.stubGlobal(
      "Image",
      class {
        src = "";
        decode = async () => {};
        naturalWidth = 4000;
        naturalHeight = 3000;
      },
    );
    vi.stubGlobal("document", {
      createElement: (tag: string) => {
        if (tag !== "canvas") throw new Error(`unexpected element: ${tag}`);
        const canvas = {
          width: 0,
          height: 0,
          getContext: () => ({
            imageSmoothingEnabled: false,
            drawImage: () => {},
          }),
          toBlob: (callback: (blob: Blob | null) => void) => callback(blob),
          toDataURL: (type?: string) =>
            type === "image/webp" && webpSupported
              ? "data:image/webp,ok"
              : "data:image/png,ok",
        };
        created.push(canvas);
        return canvas;
      },
    });
    return created;
  }

  it("transcodes to a .webp File capped at the long edge", async () => {
    const created = stubCanvas();
    const result = await compressImage(
      new File([new Uint8Array(200_000)], "photo.png", { type: "image/png" }),
    );
    expect(result).not.toBeNull();
    expect(result?.name).toBe("photo.webp");
    expect(result?.type).toBe("image/webp");
    expect(result?.size).toBe(50_000);
    // One 1x1 canvas for the webp support probe plus the output canvas.
    expect(created).toHaveLength(2);
    const output = created[created.length - 1];
    expect(output.width).toBe(2560);
    expect(output.height).toBe(1920);
  });

  it("keeps the source bytes alive until the canvas has drawn, then revokes", async () => {
    const order: string[] = [];
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:mock",
      revokeObjectURL: () => {
        order.push("revoke");
      },
    });
    vi.stubGlobal(
      "Image",
      class {
        src = "";
        decode = async () => {};
        naturalWidth = 4000;
        naturalHeight = 3000;
      },
    );
    vi.stubGlobal("document", {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          imageSmoothingEnabled: false,
          drawImage: () => {
            order.push("draw");
          },
        }),
        toBlob: (callback: (blob: Blob | null) => void) =>
          callback(new Blob([new Uint8Array(50_000)], { type: "image/webp" })),
        toDataURL: () => "data:image/webp,ok",
      }),
    });
    await compressImage(
      new File([new Uint8Array(200_000)], "photo.png", { type: "image/png" }),
    );
    // 4000×3000 → 2560×1920 fits in a single draw (no halving step needed).
    expect(order).toEqual(["draw", "revoke"]);
  });

  it("returns null when the encode would not shrink the file", async () => {
    stubCanvas({
      blob: new Blob([new Uint8Array(300_000)], { type: "image/webp" }),
    });
    expect(
      await compressImage(
        new File([new Uint8Array(200_000)], "photo.png", { type: "image/png" }),
      ),
    ).toBeNull();
  });

  it("returns null when the browser cannot encode webp", async () => {
    stubCanvas({ webpSupported: false });
    const bitmap = vi.fn();
    vi.stubGlobal("createImageBitmap", bitmap);
    expect(
      await compressImage(
        new File([new Uint8Array(200_000)], "photo.png", { type: "image/png" }),
      ),
    ).toBeNull();
    expect(bitmap).not.toHaveBeenCalled();
  });

  it("gives up when toBlob never calls back instead of stalling the upload", async () => {
    vi.useFakeTimers();
    try {
      const created: { width: number; height: number }[] = [];
      vi.stubGlobal("URL", {
        createObjectURL: () => "blob:mock",
        revokeObjectURL: () => {},
      });
      vi.stubGlobal(
        "Image",
        class {
          src = "";
          decode = async () => {};
          naturalWidth = 4000;
          naturalHeight = 3000;
        },
      );
      vi.stubGlobal("document", {
        createElement: () => {
          const canvas = {
            width: 0,
            height: 0,
            getContext: () => ({
              imageSmoothingEnabled: false,
              drawImage: () => {},
            }),
            toBlob: () => {},
            toDataURL: () => "data:image/webp,ok",
          };
          created.push(canvas);
          return canvas;
        },
      });
      const pending = compressImage(
        new File([new Uint8Array(200_000)], "photo.png", { type: "image/png" }),
      );
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await pending).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to createImageBitmap when <img> decode fails", async () => {
    const created = stubCanvas();
    vi.stubGlobal(
      "Image",
      class {
        src = "";
        decode = async () => {
          throw new Error("decode unsupported");
        };
      },
    );
    vi.stubGlobal("createImageBitmap", async () => ({
      width: 4000,
      height: 3000,
      close: () => {},
    }));
    const result = await compressImage(
      new File([new Uint8Array(200_000)], "photo.jpg", { type: "image/jpeg" }),
    );
    expect(result?.name).toBe("photo.webp");
    const output = created[created.length - 1];
    expect(output.width).toBe(2560);
    expect(output.height).toBe(1920);
  });
});

describe("compressAudio", () => {
  /** Minimal 16-bit PCM WAV header + payload so the parser sees a real rate. */
  function wavBytes(options: {
    sampleRate?: number;
    channels?: number;
    samples?: number;
  }): Uint8Array<ArrayBuffer> {
    const { sampleRate = 48_000, channels = 2, samples = 96_000 } = options;
    const dataBytes = samples * channels * 2;
    const bytes = new Uint8Array(44 + dataBytes);
    const view = new DataView(bytes.buffer);
    const ascii = (offset: number, text: string) => {
      for (let index = 0; index < text.length; index += 1) {
        bytes[offset + index] = text.charCodeAt(index);
      }
    };
    ascii(0, "RIFF");
    view.setUint32(4, bytes.byteLength - 8, true);
    ascii(8, "WAVE");
    ascii(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true);
    ascii(36, "data");
    view.setUint32(40, dataBytes, true);
    return bytes;
  }

  function stubDecode(
    buffer: { numberOfChannels: number; length: number },
    options: { playback?: boolean; rates?: number[] } = {},
  ) {
    const { playback = true, rates = [] } = options;
    const channels = Array.from(
      { length: buffer.numberOfChannels },
      () => new Float32Array(buffer.length),
    );
    vi.stubGlobal(
      "OfflineAudioContext",
      class {
        // Positional constructor: (channels, length, sampleRate).
        constructor(_channels: number, _length: number, rate: number) {
          rates.push(rate);
        }
        decodeAudioData = async () => {
          if (!playback) throw new Error("no opus support");
          return {
            numberOfChannels: buffer.numberOfChannels,
            sampleRate: 48_000,
            length: buffer.length,
            getChannelData: (index: number) => channels[index],
          };
        };
      },
    );
    return rates;
  }

  it("transcodes wav to a .ogg File, one encode call per second of audio", async () => {
    // Two seconds of decoded audio → two chunks, then flush. The decode-ability
    // probe adds one encode (its 20 ms silence frame), one flush and one free.
    stubDecode({ numberOfChannels: 2, length: 96_000 });
    const result = await compressAudio(
      new File([wavBytes({ samples: 400_000 })], "clip.wav", {
        type: "audio/wav",
      }),
    );
    expect(result).not.toBeNull();
    expect(result?.name).toBe("clip.ogg");
    expect(result?.type).toBe("audio/ogg");
    expect(opusMock.state.encodeCalls).toBe(3);
    expect(opusMock.state.flushCalls).toBe(2);
    expect(opusMock.state.freeCalls).toBe(2);
    expect(opusMock.state.options).toMatchObject({
      sampleRate: 48_000,
      channels: 2,
      bitrate: 96,
      application: "audio",
    });
  });

  it("decodes at the source rate so low-rate recordings stay cheap", async () => {
    const rates = stubDecode({ numberOfChannels: 1, length: 1920 });
    await compressAudio(
      new File([wavBytes({ sampleRate: 16_000, channels: 1 })], "voice.wav", {
        type: "audio/wav",
      }),
    );
    // The decode-ability probe runs first at 48 kHz, then the source at its own rate.
    expect(rates).toEqual([48_000, 16_000]);
    expect(opusMock.state.options).toMatchObject({
      sampleRate: 16_000,
      channels: 1,
      bitrate: 32,
      application: "voip",
    });
  });

  it("skips the transcode when the browser cannot play Ogg Opus back", async () => {
    const rates = stubDecode(
      { numberOfChannels: 1, length: 1920 },
      { playback: false },
    );
    expect(
      await compressAudio(
        new File([wavBytes({ channels: 1 })], "clip.wav", {
          type: "audio/wav",
        }),
      ),
    ).toBeNull();
    // The probe's own decode is the only one attempted — the source is never
    // decoded. (The probe does encode its 20 ms silence frame.)
    expect(rates).toEqual([48_000]);
    expect(opusMock.state.options).toMatchObject({
      sampleRate: 48_000,
      channels: 1,
      bitrate: 32,
      application: "voip",
    });
  });

  it("skips the transcode when the decoded PCM would blow the memory budget", async () => {
    const rates = stubDecode({ numberOfChannels: 1, length: 1920 });
    // A 42-byte FLAC header declaring ~3 hours of 8 kHz mono audio: decoding
    // it would allocate hundreds of MB, so the estimate must stop it first.
    const bytes = new Uint8Array(42);
    const view = new DataView(bytes.buffer);
    for (const [index, char] of Array.from("fLaC").entries()) {
      bytes[index] = char.charCodeAt(0);
    }
    bytes[4] = 0x80; // last metadata block, type 0 (STREAMINFO)
    bytes[7] = 34; // 24-bit STREAMINFO length
    const sampleRate = 8_000;
    const totalSamples = 86_400_000;
    bytes[8 + 10] = (sampleRate >> 12) & 0xff;
    bytes[8 + 11] = (sampleRate >> 4) & 0xff;
    bytes[8 + 12] |= (sampleRate & 0x0f) << 4; // channels-1=0, so bits 1-3 stay 0
    bytes[8 + 13] = Math.floor(totalSamples / 2 ** 32) & 0x0f;
    view.setUint32(8 + 14, totalSamples % 2 ** 32, false);
    const file = new File([bytes], "long.flac", { type: "audio/flac" });
    expect(await compressAudio(file)).toBeNull();
    // Only the probe decoded; the source never reached decodeAudioData.
    expect(rates).toEqual([48_000]);
  });

  it("still transcodes when the header cannot be parsed", async () => {
    const rates = stubDecode({ numberOfChannels: 1, length: 960 });
    const bytes = new Uint8Array(5_000);
    bytes.set([0x52, 0x49, 0x46, 0x46]); // RIFF, then garbage
    const result = await compressAudio(
      new File([bytes], "mystery.wav", { type: "audio/wav" }),
    );
    expect(result?.name).toBe("mystery.ogg");
    // Probe, then the unparseable source falls back to 48 kHz.
    expect(rates).toEqual([48_000, 48_000]);
  });

  it("keeps the original file when the decode proof rejects this browser's own ogg", async () => {
    // The probe itself is what fails: no source is ever decoded, because the
    // browser has just demonstrated it cannot play what the encoder produces.
    let calls = 0;
    vi.stubGlobal(
      "OfflineAudioContext",
      class {
        decodeAudioData = async () => {
          calls += 1;
          throw new Error("no opus demuxer");
        };
      },
    );
    expect(
      await compressAudio(
        new File([wavBytes({ channels: 1 })], "clip.wav", {
          type: "audio/wav",
        }),
      ),
    ).toBeNull();
    expect(calls).toBe(1);
    // The probe encodes one silence frame before its decode fails; the source
    // file itself is never encoded.
    expect(opusMock.state.options).toMatchObject({
      sampleRate: 48_000,
      channels: 1,
      bitrate: 32,
      application: "voip",
    });
  });

  it("keeps the original file when the source decodes to no samples", async () => {
    // A headers-only Opus stream is unplayable (verified against Chromium), so
    // an empty decode must not be uploaded as if it were a real transcode.
    stubDecode({ numberOfChannels: 1, length: 0 });
    expect(
      await compressAudio(
        new File([wavBytes({ channels: 1 })], "empty.wav", {
          type: "audio/wav",
        }),
      ),
    ).toBeNull();
  });

  it("returns null when the transcode would not shrink the file", async () => {
    stubDecode({ numberOfChannels: 1, length: 960 });
    expect(
      await compressAudio(
        new File([new Uint8Array(5)], "clip.wav", { type: "audio/wav" }),
      ),
    ).toBeNull();
  });

  it("returns null when decoding fails", async () => {
    vi.stubGlobal("document", {
      createElement: () => ({ canPlayType: () => "probably" }),
    });
    vi.stubGlobal(
      "OfflineAudioContext",
      class {
        decodeAudioData = async () => {
          throw new Error("unsupported codec");
        };
      },
    );
    expect(
      await compressAudio(
        new File([new Uint8Array(5_000)], "clip.wav", { type: "audio/wav" }),
      ),
    ).toBeNull();
  });
});

describe("prepareUploadFile", () => {
  it("passes the file through untouched when both switches are off", async () => {
    setImageCompressionEnabled(false);
    setAudioCompressionEnabled(false);
    const file = new File([new Uint8Array(10)], "a.txt", {
      type: "text/plain",
    });
    expect(await prepareUploadFile(file)).toBe(file);
  });

  it("passes the file through untouched when nothing matches the skip rules", async () => {
    const file = new File([new Uint8Array(10)], "a.txt", {
      type: "text/plain",
    });
    expect(await prepareUploadFile(file)).toBe(file);
  });

  it("feeds compressed output to the next stage, never the other way round", async () => {
    // A tiny png matches no compressor (below the size floor): identity.
    const file = new File([new Uint8Array(10)], "a.png", { type: "image/png" });
    expect(await prepareUploadFile(file)).toBe(file);
  });
});
