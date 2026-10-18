/**
 * Rules for the base URL of a remote engine or an external AI service.
 * External hosts must use HTTPS. Plain HTTP is allowed only for addresses on this machine
 * or a private network, with a warning. A URL may not carry a user name, a password, a query or
 * a fragment, so that keys never end up in a URL.
 */

export type EndpointCheck =
  | { readonly ok: true; readonly url: URL; readonly host: string; readonly warning?: string }
  | { readonly ok: false; readonly reason: string };

/** True for loopback, private and link-local addresses, and names that stay on this machine. */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }
  if (host.includes(":")) {
    return host === "::1" || /^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host);
  }
  return false;
}

export function checkEndpoint(text: string): EndpointCheck {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return { ok: false, reason: "This is not a valid URL." };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "Remove the user name and password from the URL." };
  }
  if (url.search || url.hash) {
    return { ok: false, reason: "Remove the query and fragment. Keys go in the key field." };
  }
  const host = url.host;
  if (url.protocol === "https:") return { ok: true, url, host };
  if (url.protocol === "http:") {
    if (isPrivateHost(url.hostname)) {
      return {
        ok: true,
        url,
        host,
        warning: "Plain HTTP is not encrypted. Use it only on a network you trust.",
      };
    }
    return { ok: false, reason: "External hosts must use HTTPS." };
  }
  return { ok: false, reason: "Use an https:// URL." };
}
