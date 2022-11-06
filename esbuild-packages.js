const { build } = require('esbuild');
const yargs = require('yargs');
const chokidar = require('chokidar');
const fs = require('fs');
const glob = require('glob');
const crypto = require('crypto');

const argv = yargs(process.argv.slice(2))
	.command('build', 'Builds the project files')
	.options({
		platform: {
			type: 'string',
			default: 'browser',
			describe: 'The platform to build for.',
			choices: ['browser'],
		},
		watch: {
			type: 'boolean',
			default: false,
			describe: 'Should watch the files and rebuild on change?',
		},
	})
	.help()
	.alias('help', 'h').argv;

// Attached to all script URLs to force browsers to download the
// resources again.
const CACHE_BUSTER = Math.random().toFixed(16).slice(2);

// Provided by esbuild – see build.js in the repo root.
const serviceWorkerOrigin = process.env.SERVICE_WORKER_ORIGIN || 'http://127.0.0.1:8777';
const serviceWorkerUrl = `${serviceWorkerOrigin}/service-worker.js`;
const wasmWorkerBackend = process.env.WASM_WORKER_BACKEND || 'iframe';
let workerThreadScript;

if (wasmWorkerBackend === 'iframe') {
	const wasmWorkerOrigin = process.env.WASM_WORKER_ORIGIN || 'http://127.0.0.1:8777';
	workerThreadScript = `${wasmWorkerOrigin}/iframe-worker.html?${CACHE_BUSTER}`;
} else {
	workerThreadScript = `${serviceWorkerOrigin}/worker-thread.js?${CACHE_BUSTER}`;
}

const baseConfig = {
	logLevel: 'info',
	platform: argv.platform,
	define: {
		CACHE_BUSTER: JSON.stringify(CACHE_BUSTER),
		'process.env.BUILD_PLATFORM': JSON.stringify(argv.platform),
	},
	watch: argv.watch,
	target: ['chrome106', 'firefox100', 'safari15'],
	bundle: true,
	external: ['xmlhttprequest'],
	loader: {
		'.php': 'text',
	},
};

function getInternalDependencies() {
	return Object.entries(
		JSON.parse(fs.readFileSync(`package.json`)).dependencies
	)
		.filter(([name, version]) => version.startsWith('file:'))
		.map(([name, version]) => name);
}

// Build each package first
const configFor = (packageName, entrypoints = ['index']) => {
	const repoDeps = getInternalDependencies();
	return {
		...baseConfig,
		external: [...baseConfig.external, ...repoDeps],
		entryPoints: Object.fromEntries(
			entrypoints.map((entrypoint) => [
				entrypoint,
				`packages/${packageName}/src/${entrypoint}.ts`,
			])
		),
		format: 'cjs',
		outdir: `packages/${packageName}/build`,
	};
};
exports.configFor = configFor;

async function main() {
	// Build the packages first
	const configs = {
		'php-wasm': {
			...configFor('php-wasm'),
			define: {
				...baseConfig.define,
				PHP_JS_HASH: JSON.stringify(
					hashFiles([`packages/php-wasm/build-wasm/php.js`])
				),
			},
		},
		'php-wasm-browser': configFor('php-wasm-browser', [
			'index',
			'service-worker/worker-library',
			'worker-thread/worker-library',
		]),
		'wordpress-wasm': {
			...configFor('wordpress-wasm', [
				'index',
				'service-worker',
				'worker-thread',
				'example-app',
			]),
			define: {
				...baseConfig.define,
				SERVICE_WORKER_URL: JSON.stringify(serviceWorkerUrl),
				WASM_WORKER_THREAD_SCRIPT_URL:
					JSON.stringify(workerThreadScript),
				WASM_WORKER_BACKEND: JSON.stringify(wasmWorkerBackend),
				WP_JS_HASH: JSON.stringify(
					hashFiles([`packages/wordpress-wasm/build-wp/wp.js`])
				),
			},
		},
	};

	for (const [packageName, config] of Object.entries(configs)) {
		// Commonjs
		await build(config);

		// ES modules
		await build({
			...config,
			format: 'esm',
			outdir: config.outdir + '-module',
		});

		const packageOutDir = config.outdir;

		const ops = [
			[`packages/${packageName}/src/**/*.html`, buildHTMLFile],
			[`packages/${packageName}/src/**/*.php`, copyToDist],
			[`packages/${packageName}/src/.htaccess`, copyToDist],
		];

		for (const [pattern, mapper] of ops) {
			mapGlob(pattern, mapper.bind(null, packageOutDir));
		}
	}

	// Then build the entire project
	const globalOutDir = 'build';
	await build({
		...baseConfig,
		outdir: globalOutDir,
		nodePaths: ['packages'],
	});

	console.log('');
	console.log('Static files copied: ');
	mapGlob('packages/*/build/*.html', buildHTMLFile.bind(null, globalOutDir));
	mapGlob('packages/*/build/*.php', copyToDist.bind(null, globalOutDir));
}

if (require.main === module) {
	main();
}
exports.main = main;

function mapGlob(pattern, mapper) {
	glob.sync(pattern).map(mapper).forEach(logBuiltFile);
	if (argv.watch) {
		chokidar.watch(pattern).on('change', mapper);
	}
}

function copyToDist(outdir, filePath) {
	const filename = filePath.split('/').pop();
	const outPath = `${outdir}/${filename}`;
	fs.copyFileSync(filePath, outPath);
	return outPath;
}

function buildHTMLFile(outdir, filePath) {
	let content = fs.readFileSync(filePath).toString();
	content = content.replace(
		/(<script[^>]+src=")([^"]+)("><\/script>)/,
		`$1$2?${CACHE_BUSTER}$3`
	);
	const filename = filePath.split('/').pop();
	const outPath = `${outdir}/${filename}`;
	fs.writeFileSync(outPath, content);
	return outPath;
}

function logBuiltFile(outPath) {
	const outPathToLog = outPath.replace(/^\.\//, '');
	console.log(`  ${outPathToLog}`);
}

function hashFiles(filePaths) {
	// if all files exist
	if (!filePaths.every(fs.existsSync)) {
		return '';
	}
	return sha256(
		Buffer.concat(filePaths.map((filePath) => fs.readFileSync(filePath)))
	);
}

function sha256(buffer) {
	const hash = crypto.createHash('sha256');
	hash.update(buffer);
	return hash.digest('hex');
}

if (argv.watch) {

	const express = require('express');
	const app = express();

	app.use(express.static('build'));

	app.use((req, res, next) => {

		if (req.url.startsWith('/scope:')) {

			req.url = '/' + req.url.split('/').slice(2).join('/');
		}
		else if (req.url.startsWith('/plugin-proxy')) {

			/*
			const url = new URL(req.url, 'http://127.0.0.1:8777');
			const pluginName = url.searchParams.get('plugin').replace(/[^a-zA-Z0-9\.\-_]/, '');

			fetch(`https://downloads.wordpress.org/plugin/${pluginName}`)
			.then(response => {
				response.body.pipe(res);
			});
			
			console.log('HERE2')

			*/

			res.end();
		}

		res.sendFile( __dirname + '/build/index.html');
	});

	app.listen(8777);
}