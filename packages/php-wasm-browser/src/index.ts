export { setURLScope } from './scope';
export {
	spawnPHPWorkerThread,
	SpawnedWorkerThread,
} from './worker-thread/window-library';
export { registerServiceWorker } from './service-worker/window-library';
export { postMessageExpectReply, awaitReply, responseTo } from './messaging';
export { DEFAULT_BASE_URL, getPathQueryFragment } from './utils';
