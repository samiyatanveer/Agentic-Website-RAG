export function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
