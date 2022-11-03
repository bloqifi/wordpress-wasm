import {
	initializeServiceWorker,
	seemsLikeAPHPServerPath,
} from 'php-wasm-browser/src/service-worker/worker-library';
import { isUploadedFilePath } from './utils';

initializeServiceWorker({
	shouldForwardRequestToPHPServer,
});

function shouldForwardRequestToPHPServer(request, unscopedUrl: URL) {
	const path = unscopedUrl.pathname;
	return (
		!path.startsWith('/plugin-proxy') &&
		(seemsLikeAPHPServerPath(path) || isUploadedFilePath(path))
	);
}
