import { MAX_RECEIPT_BYTES } from "./order-receipts";
export function receiptPhotoDimensions(width: number, height: number) {
  const scale = Math.min(1, 1800 / width, 8000 / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
/** Keep ordinary uploads untouched; compress oversized phone photos locally. */
export async function prepareReceiptPhoto(file: File): Promise<File> {
  if (file.size <= MAX_RECEIPT_BYTES || !file.type.startsWith("image/"))
    return file;
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(
          new Error(
            "This photo could not be resized. Choose a smaller image or PDF (up to 3 MB).",
          ),
        );
      image.src = url;
    });
    let dimensions = receiptPhotoDimensions(
      image.naturalWidth,
      image.naturalHeight,
    );
    for (let attempt = 0; attempt < 4; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      const context = canvas.getContext("2d");
      if (!context)
        throw new Error(
          "Photo compression is unavailable. Choose a file up to 3 MB.",
        );
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.85 - attempt * 0.1),
      );
      if (blob && blob.size <= MAX_RECEIPT_BYTES)
        return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
          type: "image/jpeg",
        });
      dimensions = {
        width: Math.max(1, Math.round(dimensions.width * 0.8)),
        height: Math.max(1, Math.round(dimensions.height * 0.8)),
      };
    }
    throw new Error(
      "This photo is too large. Choose a smaller image or PDF (up to 3 MB).",
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
