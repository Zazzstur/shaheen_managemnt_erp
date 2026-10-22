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

const maxClipboardEdge = 1600;

export async function prepareClipboardPng(blob: Blob) {
  try {
    const bitmap = await createImageBitmap(blob);
    const largest = Math.max(bitmap.width, bitmap.height);
    const scale = largest > maxClipboardEdge ? maxClipboardEdge / largest : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return blob.type === "image/png"
        ? blob
        : new Blob([blob], { type: "image/png" });
    }
    context.fillStyle = "#FDFBF3";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const png = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/png");
    });
    return png ?? blob;
  } catch {
    return blob.type === "image/png"
      ? blob
      : new Blob([await blob.arrayBuffer()], { type: "image/png" });
  }
}

export function copyPngToClipboard(file: Blob) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    return Promise.resolve(false);
  }
  const png =
    file.type === "image/png" ? file : new Blob([file], { type: "image/png" });
  try {
    return navigator.clipboard
      .write([
        new ClipboardItem({
          "image/png": Promise.resolve(png),
        }),
      ])
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
  file: Blob,
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
