import { describe, expect, it } from 'vitest';
import { isCrossSiteForm } from './csrf.js';

const req = (method: string, headers: Record<string, string>) =>
	new Request('http://x/settings', { method, headers, body: method === 'GET' ? undefined : 'a=1' });

describe('isCrossSiteForm', () => {
	const tailscale = new URL('http://100.75.53.22:3001/settings?/practice');
	const cloud = new URL('https://app.example.com/settings?/practice');
	const form = { 'content-type': 'application/x-www-form-urlencoded' };

	it('allows same host over http and https', () => {
		expect(isCrossSiteForm(req('POST', { ...form, origin: 'http://100.75.53.22:3001' }), tailscale)).toBe(false);
		expect(isCrossSiteForm(req('POST', { ...form, origin: 'https://app.example.com' }), cloud)).toBe(false);
		// behind the tunnel the server may see http while the browser says https
		expect(isCrossSiteForm(req('POST', { ...form, origin: 'https://app.example.com' }), new URL('http://app.example.com/'))).toBe(false);
	});

	it('blocks foreign or missing origin on forms', () => {
		expect(isCrossSiteForm(req('POST', { ...form, origin: 'https://evil.example' }), cloud)).toBe(true);
		expect(isCrossSiteForm(req('POST', { ...form, origin: 'http://100.75.53.22:3000' }), tailscale)).toBe(true);
		expect(isCrossSiteForm(req('POST', form), cloud)).toBe(true);
		expect(isCrossSiteForm(req('POST', { 'content-type': 'multipart/form-data; boundary=x', origin: 'null' }), cloud)).toBe(true);
	});

	it('ignores reads and JSON', () => {
		expect(isCrossSiteForm(req('GET', {}), cloud)).toBe(false);
		expect(isCrossSiteForm(req('PUT', { 'content-type': 'application/json', origin: 'https://evil.example' }), cloud)).toBe(false);
	});
});
