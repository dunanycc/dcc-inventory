import { afterEach, expect, it, vi } from "vitest";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
import { isMobileDevice, isMobileClient } from "./mobile-landing";
import { receiptPhotoDimensions, prepareReceiptPhoto } from "./receipt-photo";
it("detects phone/tablet logins without changing desktop defaults", () => {
  expect(isMobileDevice("Mozilla iPhone Mobile Safari")).toBe(true);
  expect(isMobileDevice("Mozilla iPad Safari")).toBe(true);
  expect(isMobileDevice("Mozilla Android Chrome")).toBe(true);
  expect(isMobileDevice("Mozilla Chrome", "?1")).toBe(true);
  expect(isMobileDevice("Mozilla Macintosh Chrome", "?0")).toBe(false);
});
it("sizes phone photos without enlarging them or distorting long receipts", () => {
  expect(receiptPhotoDimensions(4000, 6000)).toEqual({
    width: 1800,
    height: 2700,
  });
  expect(receiptPhotoDimensions(1000, 12000)).toEqual({
    width: 667,
    height: 8000,
  });
  expect(receiptPhotoDimensions(500, 1000)).toEqual({
    width: 500,
    height: 1000,
  });
});
it("leaves small photos and PDF files unchanged", async () => {
  const file = new File(["photo"], "photo.jpg", { type: "image/jpeg" });
  expect(await prepareReceiptPhoto(file)).toBe(file);
});

it("recognizes iPads using desktop Safari user-agent without treating Macs as tablets", () => {
  expect(isMobileClient("Mozilla Macintosh Safari", 5)).toBe(true);
  expect(isMobileClient("Mozilla Macintosh Safari", 0)).toBe(false);
});

it("compresses an oversized phone photo before upload and releases its preview URL", async () => {
  const revoke = vi.fn();
  vi.stubGlobal("URL", {
    createObjectURL: () => "blob:receipt",
    revokeObjectURL: revoke,
  });
  vi.stubGlobal(
    "Image",
    class {
      naturalWidth = 4000;
      naturalHeight = 6000;
      onload: (() => void) | null = null;
      set src(value: string) {
        void value;
        queueMicrotask(() => this.onload?.());
      }
    },
  );
  const draw = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    fillRect: vi.fn(),
    drawImage: draw,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    (callback) =>
      callback(
        new Blob([new Uint8Array([255, 216, 255])], { type: "image/jpeg" }),
      ),
  );
  const photo = new File([new Uint8Array(3 * 1024 * 1024 + 1)], "phone.heic", {
    type: "image/heic",
  });
  const prepared = await prepareReceiptPhoto(photo);
  expect(prepared.name).toBe("phone.jpg");
  expect(prepared.type).toBe("image/jpeg");
  expect(prepared.size).toBeLessThan(3 * 1024 * 1024);
  expect(draw).toHaveBeenCalledWith(expect.anything(), 0, 0, 1800, 2700);
  expect(revoke).toHaveBeenCalledWith("blob:receipt");
});
