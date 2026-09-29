import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";

const phonePattern = /^\d{10,15}$/;

export async function POST(request: Request) {
  if (process.platform !== "win32") {
    return Response.json({ ok: false, pasted: false }, { status: 501 });
  }

  const origin = request.headers.get("origin");
  if (
    origin &&
    !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  ) {
    return Response.json({ ok: false, pasted: false }, { status: 403 });
  }

  let body: { phone?: unknown; caption?: unknown; imageBase64?: unknown };
  try {
    body = (await request.json()) as {
      phone?: unknown;
      caption?: unknown;
      imageBase64?: unknown;
    };
  } catch {
    return Response.json({ ok: false, pasted: false }, { status: 400 });
  }

  if (typeof body.phone !== "string" || !phonePattern.test(body.phone)) {
    return Response.json({ ok: false, pasted: false }, { status: 400 });
  }
  if (typeof body.caption !== "string" || body.caption.length > 500) {
    return Response.json({ ok: false, pasted: false }, { status: 400 });
  }
  if (typeof body.imageBase64 !== "string" || body.imageBase64.length > 6_000_000) {
    return Response.json({ ok: false, pasted: false }, { status: 400 });
  }

  const image = Buffer.from(body.imageBase64, "base64");
  const pngSignature = image.subarray(0, 8).toString("hex");
  if (pngSignature !== "89504e470d0a1a0a" || image.length < 32) {
    return Response.json({ ok: false, pasted: false }, { status: 400 });
  }

  const imagePath = join(tmpdir(), `invoice-${randomBytes(8).toString("hex")}.png`);
  await writeFile(imagePath, image);

  try {
    await execFileAsync(
      "powershell.exe",
      [
        "-STA",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        join(process.cwd(), "scripts", "share-invoice-whatsapp.ps1"),
        "-Phone",
        body.phone,
        "-ImagePath",
        imagePath,
        "-Caption",
        body.caption,
      ],
      { timeout: 20_000, windowsHide: true },
    );
    return Response.json({ ok: true, pasted: true });
  } catch (error) {
    const exitCode =
      error &&
      typeof error === "object" &&
      "code" in error &&
      (typeof error.code === "number" || typeof error.code === "string")
        ? Number(error.code)
        : null;
    if (exitCode === 2) {
      return Response.json({ ok: true, pasted: false });
    }
    return Response.json({ ok: false, pasted: false }, { status: 500 });
  } finally {
    await unlink(imagePath).catch(() => undefined);
  }
}
