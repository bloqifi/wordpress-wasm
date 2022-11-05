import {
	registerServiceWorker,
	spawnPHPWorkerThread,
	SpawnedWorkerThread,
} from 'php-wasm-browser';
import { wasmWorkerUrl, wasmWorkerBackend, serviceWorkerUrl } from './config';

export async function bootWordPress(): Promise<SpawnedWorkerThread> {

	assertNotInfiniteLoadingLoop();

	const workerThread = await spawnPHPWorkerThread(
		wasmWorkerBackend,
		wasmWorkerUrl
	);
	await registerServiceWorker(serviceWorkerUrl);
	return workerThread;
}

/**
 * When the service worker fails for any reason, the page displayed inside
 * the iframe won't be a WordPress instance we expect from the service worker.
 * Instead, it will be the original page trying to load the service worker. This
 * causes an infinite loop with a loader inside a loader inside a loader.
 */
function assertNotInfiniteLoadingLoop() {
	let isBrowserInABrowser = false;
	try {
		isBrowserInABrowser =
			window.parent !== window &&
			(window as any).parent.IS_WASM_WORDPRESS;
	} catch (e) {}
	if (isBrowserInABrowser) {
		throw new Error(
			'The service worker did not load correctly. This is a bug, please report it on https://github.com/WordPress/wordpress-wasm/issues'
		);
	}
	(window as any).IS_WASM_WORDPRESS = true;
}
