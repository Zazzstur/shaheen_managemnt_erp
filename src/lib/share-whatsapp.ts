export function isLocalSchoolComputer() {
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

export function whatsAppChatUrl(phone: string, text: string) {
  const url = new URL(phone ? `https://wa.me/${phone}` : "https://wa.me/");
  if (text) {
    url.searchParams.set("text", text);
  }
  return url.toString();
}

export function copyPngToClipboard(file: Blob) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    return Promise.resolve(false);
  }
  const png =
    file.type === "image/png" ? file : new Blob([file], { type: "image/png" });
  return navigator.clipboard
    .write([new ClipboardItem({ "image/png": png })])
    .then(() => true)
    .catch(() => false);
}

export function downloadBlob(file: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export function openBrowserTab(url: string) {
  const popup = window.open(url, "_blank");
  if (popup) {
    popup.opener = null;
  }
  return popup !== null;
}

export type LiveWhatsAppShare =
  | { mode: "shared" }
  | { mode: "cancelled" }
  | { mode: "browser"; copied: boolean; opened: boolean; webUrl: string };

export function shareImageFromBrowser(
  file: File,
  options: { phone?: string | null; text?: string },
): Promise<LiveWhatsAppShare> {
  const phone = options.phone || "";
  const text = options.text ?? "";
  const webUrl = whatsAppChatUrl(phone, text);
  const coarse = window.matchMedia("(pointer: coarse)").matches;

  if (
    coarse &&
    !phone &&
    typeof navigator.share === "function" &&
    navigator.canShare?.({ files: [file] })
  ) {
    return navigator
      .share({ files: [file], title: "Homework", text: text || undefined })
      .then(() => ({ mode: "shared" as const }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return { mode: "cancelled" as const };
        }
        const opened = openBrowserTab(webUrl);
        return { mode: "browser" as const, copied: false, opened, webUrl };
      });
  }

  const opened = openBrowserTab(webUrl);
  const copiedPromise = copyPngToClipboard(file);
  return copiedPromise.then((copied) => ({
    mode: "browser" as const,
    copied,
    opened,
    webUrl,
  }));
}
