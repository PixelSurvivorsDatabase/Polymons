const NATIVE_CLIENT_ORIGINS = new Set([
  "https://localhost",
  "http://localhost",
  "capacitor://localhost",
]);

export function isAllowedClientOrigin(
  webOrigin: string,
  requestOrigin?: string,
): boolean {
  return (
    requestOrigin === undefined ||
    requestOrigin === webOrigin ||
    NATIVE_CLIENT_ORIGINS.has(requestOrigin)
  );
}
