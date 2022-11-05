# Use PHP in the browser

`php-wasm` makes running PHP code in JavaScript easy, but running PHP websites in the browser is more complex than just executing some code.

Say a PHP script renders a link and a user clicks that link. Normally, the browser sends a HTTP request to a server and reloads the page. What should happen when there is no server and reloading the page means losing all progress?

Enter `php-wasm-browser`! A set of tools to solve the common headaches of running PHP websites in the browser. Importantly, this package does not provide a ready-to-use app. It merely gives you the tools to build one. 

## Architecture

-   **Browser tab orchestrates the execution** – The browser tab is the main program. Closing or reloading it means destroying the entire execution environment.
-   **Iframe-based rendering** – Every response produced by the PHP server must be rendered in an iframe to avoid reloading the browser tab on navigation.
-   **PHP Worker Thread** – The PHP server is slow and must run in a worker thread, otherwise handling requests freezes the website UI.
-   **Service Worker routing** – All HTTP requests originating in that iframe must be intercepted by a Service worker and passed on to the PHP worker thread for rendering.

That's a lot of information to take in! Keep reading for the detailed breakdown.

### Browser tab orchestrates the execution

The main `index.html` ties the entire application together. It starts all the concurrent processes and displays the PHP responses. The app only lives as long as the main `index.html`.

Keep this point in mind as you read through the rest of the docs. At this point it may seem obvious, by the lines may get blurry later on. This package runs code outside of the browser tab using Web Workers, Service Workers, and, in the future, Shared Workers. Some of these workers may keep running even after the browser tab with `index.html` is closed.

#### Boot sequence

Here's what a boot sequence for a minimal app looks like:

![The boot sequence](./docs/boot-sequence.png)

The main app initiates the Iframe, the Service Worker, and the Worker Thread. Note how the main app doesn't use the PHP stack directly – it's all handled in the Worker Thread.

Here's what that boot sequence looks like in code:

**/index.html**:

```js
<script src="/app.js"></script>
<iframe id="my-app"></iframe>
```

**/app.js**:

```js
import {
    registerServiceWorker,
    spawnPHPWorkerThread,
	getWorkerThreadFrontend	
} from 'php-wasm-browser';

export async function startApp() {
	const workerThread = await spawnPHPWorkerThread(
        // Worker Thread backend – either 'iframe' or 'webworker'
		'webworker',
        // Must point to a valid worker thread script:
		'/worker-thread.js'
	);
    // Must point to a valid Service Worker script:
	await registerServiceWorker('/service-worker.js');

    // Create a few PHP files to browse:
    await workerThread.eval(`<?php
        file_put_contents('index.php', '<a href="page.php">Go to page.php</a>');
        file_put_contents('page.php', '<?php echo "Hello from PHP!"; ?>');
    `);

    // Navigate to index.php:
    document.getElementById('my-app').src = '/index.php';
}
startApp();
```

**/worker-thread.js**:

```js
import { initializeWorkerThread } from 'php-wasm-browser';

// Loads /php.js and /php.wasm provided by php-wasm,
// Listens to commands issued by the main app and
// the requests from the Service Worker.
initializeWorkerThread();
```

**/service-worker.js**:

```js
import { initializeServiceWorker } from 'php-wasm-browser';

// Intercepts all HTTP traffic on the current domain and
// passes it to the Worker Thread.
initializeServiceWorker();
```

Keep reading to learn how all these pieces fit together.

#### Data flow

Here's what happens whenever the iframe issues a same-domain request:

![The data flow](./docs/data-flow.png)

A step-by-step breakown:

1.  The request is intercepted by the Service Worker
2.  The Service Worker passes it to the Worker Thread
3.  The Worker Thread uses the `PHPServer` to convert that request to a response
4.  The Worker Thread passes the response to the Service Worker
5.  The Service Worker provides the browser with a response

At this point, if the request was triggered by user clicking on a link, the browser will render PHPServer's response inside the iframe.

### Iframe-based rendering

All the PHPServer responses must be rendered in an iframe to avoid reloading the page. Remember, the entire setup only lives as long as the main `index.html`. We want to avoid reloading the main app at all cost.

In our app example above, `index.php` renders the following HTML:

```html
<a href="page.php">Go to page.php</a>
```

Imagine our `index.html` rendered it in a `<div>` instead of an `<iframe>`. As soon as you clicked on that link, the browser would try to navigate from `index.html` to `page.php`. However, `index.html` runs the entire PHP app including the Worker Thread, the PHPServer, and the traffic control connecting them to the Service Worker. Navigating away from it would destroy the app.

Now, consider an iframe with the same link in it:

```html
<iframe srcdoc='<a href="page.php">Go to page.php</a>'></iframe>
```

This time, clicking the link the browser to load `page.php` **inside the iframe**. The top-level index.html where the PHP application runs remains unaffected. This is why iframes are a crucial part of the `php-wasm-browser` setup.

#### Iframes caveats

-   `target="_top"` isn't handled yet. This means that clicking on `<a target="_top">Click here</a>` will reload the main browser tab.
-   JavaScript popup windows originating in the iframe may not work correctly yet.

### PHP Worker Threads

The PHP Server is always ran in a separate thread we'll call a "Worker Thread." This happens to ensure the PHP runtime doesn't slow down the website.

Imagine the following code:

```js
<button onclick="for(let i=0;i<100000000;i++>) {}">Freeze the page</button>
<input type="text" />
```

As soon as you click that button the browser will freeze and you won't be able to type in the input. That's just how browsers work. Whether it's a for loop or a PHP server, running intensive tasks slows down the user interface.

#### Initiating the worker thread

Worker threads are separate programs that can process heavy tasks outside of the main application. They must be initiated by the main JavaScript program living in the browser tab. Here's how:

```js
const workerThread = await spawnPHPWorkerThread(
    // Worker Thread backend – either 'iframe' or 'webworker'
    'webworker',
    // Must point to a valid worker thread script:
    '/worker-thread.js'
);
workerThread.eval(`<?php
    echo "Hello from the thread!";
`);
```

Worker threads can use any multiprocessing technique like an iframe, WebWorker, or a SharedWorker. See the next sections to learn more about the supported backends.

#### Controlling the worker thread

The main application controls the worker thread by sending and receiving messages. This is implemented via a backend-specific flavor of `postMessage` and `addEventListener('message', fn)`.

Exchanging messages is the only way to control the worker threads. Remember – it is separate programs. The main app cannot access any functions or variables defined inside of the worker thread.

Conveniently, [spawnPHPWorkerThread](./src/spawn-worker-thread.js) returns an easy-to-use API object that exposes specific worker thread features and handles the message exchange internally.

#### Worker thread implementation

A worker thread must live in a separate JavaScript file. Here's what a minimal implementation of that file looks like:

```js
import { initializeWorkerThread } from 'php-wasm-browser';
initializeWorkerThread();
```

It may not seem like much, but `initializeWorkerThread()` does a lot of
the heavy lifting. Here's its documentation:

#### Worker Thread API

##### initializeWorkerThread

Call this in a worker thread script to set the stage for 
offloading the PHP processing. This function:

-   Initializes the PHP runtime
-   Starts PHPServer and PHPBrowser
-   Lets the main app know when its ready
-   Listens for messages from the main app
-   Runs the requested operations (like `run_php`)
-   Replies to the main app with the results using the [request/reply protocol](#request-reply-protocol)

Remember: The worker thread code must live in a separate JavaScript file.

A minimal worker thread script looks like this:

```js
import { initializeWorkerThread } from 'php-wasm-browser';
initializeWorkerThread();
```

You can customize the PHP loading flow via the first argument:

```js
import { initializeWorkerThread, loadPHPWithProgress } from 'php-wasm-browser';
initializeWorkerThread( bootBrowser );

async function bootBrowser({ absoluteUrl }) {
    const [phpLoaderModule, myDependencyLoaderModule] = await Promise.all([
        import(`/php.js`),
        import(`/wp.js`)
    ]);

    const php = await loadPHPWithProgress(phpLoaderModule, [myDependencyLoaderModule]);
    
    const server = new PHPServer(php, {
        documentRoot: '/www', 
        absoluteUrl: absoluteUrl
    });

    return new PHPBrowser(server);
}
```

_Parameters_

-   _configuration_ `WorkerThreadConfiguration`: The worker thread configuration.

_Returns_

-   `Object`: The backend object to communicate with the parent thread.

#### Worker thread backends

Worker threads can use any multiprocessing technique like an iframe, WebWorker, or a SharedWorker. This package provides two backends out of the box:

##### `webworker`

Spins a new `Worker` instance with the given Worker Thread script. This is the classic solution for multiprocessing in the browser and it almost became the only, non-configurable backend. The `iframe` backend only exists due to a Google Chrome bug that makes web workers prone to crashes when they're running WebAssembly. See [WASM file crashes Google Chrome](https://github.com/WordPress/wordpress-wasm/issues/1) to learn more details.

Example usage: 

**/app.js**:

```js
const workerThread = await spawnPHPWorkerThread(
    'webworker',
    '/worker-thread.js'
);
```

**/worker-thread.js**:

```js
import { initializeWorkerThread } from 'php-wasm-browser';
initializeWorkerThread();
```

##### `iframe`

Loads the PHPServer in a new iframe to avoid crashes in browsers based on Google Chrome.

The browser will **typically** run an iframe in a separate thread in one of the two cases:

1.  The `iframe-worker.html` is served with the `Origin-Agent-Cluster: ?1` header. If you're running the Apache webserver, this package ships a `.htaccess` that will add the header for you.
2.  The `iframe-worker.html` is served from a different origin. For convenience, you could point a second domain name to the same server and directory and use it just for the `iframe-worker.html`.

Pick your favorite option and make sure to use it for serving the `iframe-worker.html`.

Example usage of the iframe backend:

**/app.js**:

```js
const workerThread = await spawnPHPWorkerThread(
    'iframe',
    'http://another-domain.com/iframe-worker.html'
);
```

**/iframe-worker.html** (provided in this package):

```js
<script src="/worker-thread.js"></script>
```

**/worker-thread.js**:

```js
import { initializeWorkerThread } from 'php-wasm-browser';
initializeWorkerThread();
```

### Service Workers

[A Service Worker](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers) is used to handle the HTTP traffic using the in-browser PHPServer.

Imagine your PHP script renders the following page [in the iframe viewport](#iframe-based-rendering):

```html
<html>
    <head>
        <title>John's Website</title>
    </head>
    <body>
        <a href="/">Homepage</a>
        <a href="/blog">Blog</a>
        <a href="/contact">Contact</a>
    </body>
</html>
```

When the user clicks, say the `Blog` link, the browser would normally send a HTTP request to the remote server to fetch the `/blog` page and then display it instead of the current iframe contents. However, our app isn't running on the remote server. The browser would just display a 404 page.

Enter [Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers) – a tool to intercept the HTTP requests and handle them inside the browser.

#### Service Worker setup

The main application living in `/index.html` is responsible for registering the service worker.

Here's the minimal setup:

**/app.js:**

```js
import { registerServiceWorker } from 'php-wasm-browser';

function main() {
    // Must point to a valid Service Worker implementation:
	await registerServiceWorker( '/service-worker.js' );
}
```

You will also need a separate `/service-worker.js` file that actually intercepts and routes the HTTP requests. Here's what a minimal implementation looks like:

**/service-worker.js**:

```js
import { initializeServiceWorker } from 'php-wasm-browser';

// Intercepts all HTTP traffic on the current domain and
// passes it to the Worker Thread.
initializeServiceWorker();
```

### Cross-process communication

`php-wasm-browser` implements request/response dynamics on top of JavaScript's `postMessage`.

If `postMessage` sounds unfamiliar, it's what JavaScript threads use to communicate. Please review the [MDN Docs](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage) before continuing.

By default, `postMessage` does not offer any request/response mechanics. You may send messages to another thread and you may independently receive messages from it, but you can't send a message and await a response to that specific message. 

The idea is to include a unique `requestId` in every message sent, and then wait for a message referring to the same `requestId`.

See the [messaging module docs](./src/messaging.js) for more details.

### Scopes

Scopes keep your app working when you open it in two different different browser tabs.

The Service Worker passes the intercepted HTTP requests to the PHPServer for rendering. Technically, it sends a message through a [`BroadcastChannel`](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel) which then gets delivered to every browser tab where the application is open. This is undesirable, slow, and leads to unexpected behaviors.

Unfortunately, the Service Worker cannot directly communicate with the relevant Worker Thread – see [PR #31](https://github.com/WordPress/wordpress-wasm/pull/31) and [issue #9](https://github.com/WordPress/wordpress-wasm/issues/9) for more details.

Scopes enable each browser tab to:

-   Brand the outgoing HTTP requests with a unique tab id
-   Ignore any `BroadcastChannel` messages with a different id

Technically, a scope is a string included in the `PHPServer.absoluteUrl`. For example:

-   In an **unscoped app**, `/index.php` would be available at `http://localhost:8778/wp-login.php`
-   In an **scoped app**, `/index.php` would be available at `http://localhost:8778/scope:96253/wp-login.php`

The service worker is aware of this concept and will attach the `/scope:` found in the request URL to the related `BroadcastChannel` communication.

To use scopes, initiate the worker thread with a scoped `absoluteUrl`:

```js
import { startPHP, PHPServer, PHPBrowser } from 'php-wasm';
import { initializeWorkerThread } from 'php-wasm-browser';
import { setURLScope } from 'php-wasm-browser';

async function main() {
    const php = await startPHP(import('/php.js'));

    // Don't use the absoluteURL directly:
    const absoluteURL = 'http://127.0.0.1';

    // Instead, set the scope first:
    const scope = Math.random().toFixed(16);
    const scopedURL = setURLScope(absoluteURL, scope).toString();

    const server = new PHPServer(php, {
        documentRoot: '/var/www', 
        absoluteUrl: scopedURL
    });
    
    const browser = await new PHPBrowser(server);

    await initializeWorkerThread({
        phpBrowser: browser
    });
}
```