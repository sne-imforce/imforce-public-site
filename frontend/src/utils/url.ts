// Returns the URL only if it is an absolute HTTPS link without embedded
// credentials. Anything else (javascript:, data:, http:, malformed) is dropped,
// so a bad value in the database can never become a clickable script link.
export function safeHttpsUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}
