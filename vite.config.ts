/// <reference types="vitest/config" />
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	define: {
		// Shown by /health, to tell which image is running.
		__BUILD_TIME__: JSON.stringify(new Date().toISOString())
	},
	plugins: [
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			// Built-in check assumes one https origin; the app is also opened by http over Tailscale.
			// src/hooks.server.ts does the same-host check instead.
			csrf: { trustedOrigins: ['*'] }
		})
	],
	test: {
		include: ['src/**/*.test.ts']
	}
});
