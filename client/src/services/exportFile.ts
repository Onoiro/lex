import { Capacitor } from "@capacitor/core";

// Saving a file works differently on Android and on the web.
//
// Capacitor WebView has no download listener, so a link with
// `download:` does nothing there at all. On native we write the
// file into the app cache folder and open the system share dialog,
// where the user picks Files, Drive, Telegram, etc.
//
// Both plugins are loaded with a dynamic import, so their code does
// not enter the web bundle and the service worker precache.

async function saveOnNative(
  fileName: string,
  text: string,
  dialogTitle: string,
): Promise<void> {
  const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
  const { Share } = await import("@capacitor/share");

  await Filesystem.writeFile({
    path: fileName,
    data: text,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    recursive: true,
  });

  // Share needs a file:// URI, and the cache folder is already
  // allowed in res/xml/file_paths.xml for the app FileProvider.
  const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
  await Share.share({ files: [uri], dialogTitle });
}

function saveOnWeb(fileName: string, text: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  // The download starts asynchronously, so the blob URL must stay
  // alive for a while after the click.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Saves a JSON file on the current platform.
 * Native (Android): app cache + system share dialog.
 * Web and desktop: a normal browser download.
 * Errors are thrown to the caller, which shows them to the user.
 */
export async function saveJsonFile(
  fileName: string,
  text: string,
  dialogTitle = fileName,
): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await saveOnNative(fileName, text, dialogTitle);
    return;
  }
  saveOnWeb(fileName, text);
}
