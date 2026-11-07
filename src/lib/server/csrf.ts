const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const FORM_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'];

/**
 * Same-host check for form submissions, whatever the scheme: the app is opened both by
 * https (Cloudflare) and by http (Tailscale IP). A cross-site form always carries a foreign Origin.
 * JSON requests are not forms: browsers cannot send them cross-site without a CORS preflight.
 */
export function isCrossSiteForm(request: Request, url: URL): boolean {
	if (!MUTATING.has(request.method)) return false;
	const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
	if (type && !FORM_TYPES.includes(type)) return false;
	const origin = request.headers.get('origin');
	if (!origin) return true;
	try {
		return new URL(origin).host !== url.host;
	} catch {
		return true;
	}
}
