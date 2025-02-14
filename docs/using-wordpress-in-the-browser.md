# Using WordPress in the browser

[API Reference](https://github.com/WordPress/wordpress-wasm/tree/trunk/docs/api/wordpress-wasm.md)

Uses [php-wasm](https://github.com/WordPress/wordpress-wasm/blob/trunk/docs/using-php-in-javascript.md) and [php-wasm-browser](https://github.com/WordPress/wordpress-wasm/blob/trunk/docs/using-php-in-the-browser.md) to run WordPress fully in the browser without any PHP server.

The documentation for both is quite comprehensive, but this README file is still a work in progress. Fortunately, this package is rather thin and mostly uses the APIs provided by the other two. Please read the other two documents to learn more.

## Customizing the WordPress installation

You can customize the WordPress installation by adjusting the [Dockerfile](https://github.com/WordPress/wordpress-wasm/blob/trunk/packages/wordpress-wasm/wordpress) that generates the `wp.data` Data Dependency bundle.

Once you're finished, rebuild WordPress by running:

```bash
npm run build:wp
```

## Other notes

-   WordPress is configured to use SQLite instead of MySQL. This is possible thanks to https://github.com/aaemnnosttv/wp-sqlite-db.
-   The static files (.js, .css, etc.) are served directly from the server filesystem, not from the WebAssembly bundle.
-   PHP cannot communicate with the WordPress.org API yet, so the plugin directory etc does not work.
-   The sqlite database lives in the memory and the changes only live as long as the loaded page.
