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
  // Pass a promise so the write stays tied to this click. Awaiting the bytes
  // first, or opening WhatsApp first, makes the browser reject the copy.
  const pngPromise = file.arrayBuffer().then(
    (bytes) => new Blob([bytes], { type: "image/png" }),
  );
  try {
    return navigator.clipboard
      .write([new ClipboardItem({ "image/png": pngPromise })])
      .then(() => true)
      .catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
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

export type LiveWhatsAppShare = {
  mode: "browser";
  copied: boolean;
  opened: boolean;
  webUrl: string;
};

export function shareImageFromBrowser(
  file: File,
  options: { phone?: string | null; text?: string },
): Promise<LiveWhatsAppShare> {
  const phone = options.phone || "";
  const text = options.text ?? "";
  const webUrl = whatsAppChatUrl(phone, text);
  const copiedPromise = copyPngToClipboard(file);
  return copiedPromise.then((copied) => {
    const opened = openBrowserTab(webUrl);
    return {
      mode: "browser" as const,
      copied,
      opened,
      webUrl,
    };
  });
}
