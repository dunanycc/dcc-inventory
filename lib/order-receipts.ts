export const MAX_RECEIPT_BYTES = 3 * 1024 * 1024;
export function receiptMime(data: Uint8Array) {
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...data.slice(start, end));
  if (data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255)
    return "image/jpeg";
  if (
    data.length >= 8 &&
    [...data.slice(0, 8)].join(",") === "137,80,78,71,13,10,26,10"
  )
    return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(0, 5) === "%PDF-") return "application/pdf";
  if (
    ascii(4, 8) === "ftyp" &&
    ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(ascii(8, 12))
  )
    return "image/heic";
  throw new Error("Choose a PDF, JPEG, PNG, WebP, or HEIC receipt.");
}
export function sameOrigin(request: Request) {
  try {
    const origin = request.headers.get("origin");
    return (
      !!origin &&
      new URL(origin).host ===
        (request.headers.get("x-forwarded-host") ||
          request.headers.get("host") ||
          new URL(request.url).host)
    );
  } catch {
    return false;
  }
}
