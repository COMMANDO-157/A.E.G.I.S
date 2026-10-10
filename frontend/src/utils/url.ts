/**
 * A.E.G.I.S 4.0 — Return URL Validation Utility
 * WP-4.1.4 | Protected Routing & Authorization Foundation
 *
 * Strictly validates internal return destinations for authentication redirects.
 * Rejects external URLs, protocol-relative URLs (//), Windows backslash tricks,
 * javascript/data URI schemes, and redirect loops.
 */

/**
 * Validates and sanitizes a return/redirect path.
 *
 * @param url Candidate URL or path
 * @param fallback Safe default destination if validation fails
 * @returns Validated local path (pathname + search + hash) or fallback
 */
export function sanitizeReturnUrl(url: unknown, fallback = '/'): string {
  if (typeof url !== 'string' || !url.trim()) {
    return fallback;
  }

  const trimmed = url.trim();

  // Must begin with a single '/'
  if (!trimmed.startsWith('/')) {
    return fallback;
  }

  // Reject protocol-relative URLs: "//attacker.com"
  if (trimmed.startsWith('//')) {
    return fallback;
  }

  // Reject Windows backslash bypasses: "/\attacker.com" or "/attacker.com\.."
  if (trimmed.includes('\\')) {
    return fallback;
  }

  // Reject any embedded URL scheme before path separators (e.g., "javascript:", "data:")
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return fallback;
  }

  try {
    // Parse against a fixed internal origin
    const dummyBase = 'https://aegis.internal';
    const parsed = new URL(trimmed, dummyBase);

    // Ensure origin was not spoofed
    if (parsed.origin !== dummyBase) {
      return fallback;
    }

    // Disallow loop redirects to authentication or error pages
    const forbiddenLoopPaths = ['/login', '/register', '/suspended', '/unauthorized'];
    if (forbiddenLoopPaths.includes(parsed.pathname.toLowerCase())) {
      return fallback;
    }

    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return fallback;
  }
}
