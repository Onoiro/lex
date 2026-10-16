import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Switch between the native and the web branch inside one file.
const native = vi.hoisted(() => ({ value: false }));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => native.value },
}));

vi.mock("@capacitor/filesystem", () => ({
  Filesystem: {
    writeFile: vi.fn(async () => ({ uri: "" })),
    getUri: vi.fn(async () => ({ uri: "file:///cache/lex-dictionary.json" })),
  },
  Directory: { Cache: "CACHE" },
  Encoding: { UTF8: "utf8" },
}));

vi.mock("@capacitor/share", () => ({
  Share: { share: vi.fn(async () => ({ sharedAction: "shared" })) },
}));

import { saveJsonFile } from "@/services/exportFile";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

describe("exportFile.saveJsonFile", () => {
  beforeEach(() => {
    native.value = false;
    vi.clearAllMocks();
  });

  describe("web branch", () => {
    let createObjectURL: ReturnType<typeof vi.fn>;
    let revokeObjectURL: ReturnType<typeof vi.fn>;
    let anchor: { click: ReturnType<typeof vi.fn>; download: string; href: string };

    beforeEach(() => {
      // Patch as statics: vi.stubGlobal("URL", ...) breaks `new Request`.
      createObjectURL = vi.fn(() => "blob:mock");
      revokeObjectURL = vi.fn();
      URL.createObjectURL = createObjectURL;
      URL.revokeObjectURL = revokeObjectURL;
      anchor = { click: vi.fn(), download: "", href: "" };
      // jsdom ignores `download`, so the created link is observed directly.
      vi.spyOn(document, "createElement").mockReturnValue(
        anchor as unknown as HTMLAnchorElement,
      );
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("creates a download link with the given file name", async () => {
      await saveJsonFile("lex-dictionary.json", "[]");

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(anchor.click).toHaveBeenCalledTimes(1);
      expect(anchor.download).toBe("lex-dictionary.json");
      expect(anchor.href).toBe("blob:mock");
    });

    it("keeps the blob URL alive after the click", async () => {
      vi.useFakeTimers({ toFake: ["Date", "setTimeout"] });

      await saveJsonFile("lex-dictionary.json", "[]");
      // Revoking too early cancels the download in some browsers.
      expect(revokeObjectURL).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1000);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
    });
  });

  describe("native branch", () => {
    beforeEach(() => {
      native.value = true;
    });

    it("writes the file into the app cache and shares it", async () => {
      await saveJsonFile("lex-dictionary.json", '[{"word":"a"}]', "Export dictionary");

      expect(Filesystem.writeFile).toHaveBeenCalledWith({
        path: "lex-dictionary.json",
        data: '[{"word":"a"}]',
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
        recursive: true,
      });

      expect(Filesystem.getUri).toHaveBeenCalledWith({
        path: "lex-dictionary.json",
        directory: Directory.Cache,
      });

      expect(Share.share).toHaveBeenCalledWith({
        files: ["file:///cache/lex-dictionary.json"],
        dialogTitle: "Export dictionary",
      });
    });

    it("does not use the web download path", async () => {
      URL.createObjectURL = vi.fn();
      await saveJsonFile("lex-dictionary.json", "[]");
      expect(URL.createObjectURL).not.toHaveBeenCalled();
    });

    it("passes plugin errors to the caller", async () => {
      vi.mocked(Filesystem.writeFile).mockRejectedValueOnce(new Error("disk full"));

      await expect(saveJsonFile("lex-dictionary.json", "[]")).rejects.toThrow("disk full");
      expect(Share.share).not.toHaveBeenCalled();
    });
  });
});
