import { bootWordPress } from './index';

const query = new URL(document.location.href).searchParams;

const wpFrame = document.querySelector('#wp') as HTMLIFrameElement;

// Manage the address bar
function setupAddressBar(wasmWorker) {

	wpFrame.addEventListener('load', (e: any) => {

		document.body.classList.remove('is-loading');

		const newUrl = wasmWorker.internalUrlToPath(
			e.currentTarget!.contentWindow.location.href
		);

		window.history.pushState({}, '', `/#${newUrl}`);
	});

	window.addEventListener('hashchange', function() {
		
		let requestedPath = window.location.hash.slice(1);

		// Ensure a trailing slash when requesting directory paths
		const isDirectory = !requestedPath.split('/').pop()!.includes('.');
		if (isDirectory && !requestedPath.endsWith('/')) {
			requestedPath += '/';
		}

		wpFrame.src = wasmWorker.pathToInternalUrl(requestedPath);

	}, false);
}

async function main() {
	const preinstallPlugin = query.get('plugin');
	let pluginResponse;
	if (preinstallPlugin) {
		pluginResponse = await fetch(
			'/plugin-proxy?plugin=' + preinstallPlugin
		);
	}

	const workerThread = await bootWordPress();

	setupAddressBar(workerThread);

	if (query.get('rpc')) {
		console.log('Registering an RPC handler');
		async function handleMessage(event) {
			if (event.data.type === 'rpc') {
				return await workerThread[event.data.method](
					...event.data.args
				);
			} else if (event.data.type === 'go_to') {
				wpFrame.src = workerThread.pathToInternalUrl(event.data.path);
			} else if (event.data.type === 'is_alive') {
				return true;
			}
		}
		window.addEventListener('message', async (event) => {
			const result = await handleMessage(event.data);

			// When `requestId` is present, the other thread expects a response:
			if (event.data.requestId) {
				const response = responseTo(event.data.requestId, result);
				window.parent.postMessage(response, '*');
			}
		});
	}

	const initialUrl = query.get('url') || '/';
	wpFrame.src = workerThread.pathToInternalUrl(initialUrl);
}

main();