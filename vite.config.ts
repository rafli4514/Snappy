import basicSsl from '@vitejs/plugin-basic-ssl';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
	const useHttps = mode === 'https' || process.env.DISTUDIO_HTTPS === '1';

	return {
		plugins: [
			...(useHttps ? [basicSsl()] : []),
			tailwindcss(),
			sveltekit({
				compilerOptions: {
					runes: undefined
				},
				// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapters for a list.
				// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
				// See https://svelte.dev/docs/kit/adapters for more information about adapters.
				adapter: adapter()
			})
		],
		server: {
			host: true,
			port: 5173
		},
		// gifenc ships a CJS entry only; named imports break when Vite externalizes
		// it for SSR, so bundle it through the Vite pipeline (picks its ESM build).
		ssr: {
			noExternal: ['gifenc']
		}
	};
});
