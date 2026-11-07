import type { Handle } from '@sveltejs/kit/hooks';
import { isCrossSiteForm } from '#lib/server/csrf.js';

export const handle: Handle = ({ event, resolve }) => {
	if (isCrossSiteForm(event.request, event.url)) {
		return new Response('Cross-site form submissions are forbidden', { status: 403 });
	}
	return resolve(event);
};
