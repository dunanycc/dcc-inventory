export function isMobileDevice(
  userAgent: string,
  clientHint: string | null = null,
) {
  return (
    clientHint === "?1" || /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)
  );
}

export function isMobileClient(userAgent: string, maxTouchPoints: number) {
  return (
    isMobileDevice(userAgent) ||
    (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)
  );
}
