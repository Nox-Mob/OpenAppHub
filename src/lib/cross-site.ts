/**
 * True for a browser request that changes something and was sent from a page on another site
 * (Sec-Fetch-Site: cross-site). The suite's own subdomains are the same site, and servers such as
 * Stripe and mail systems send no Sec-Fetch-Site header, so neither is affected.
 */
export function crossSiteWrite(request: Request): boolean {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS")
    return false;
  return request.headers.get("sec-fetch-site") === "cross-site";
}
