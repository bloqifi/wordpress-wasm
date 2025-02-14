<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) > [php-wasm](./php-wasm.md) > [startPHP](./php-wasm.startphp.md)

## startPHP() function
startPHP<!-- -->(\
&emsp;&emsp;&emsp;<!-- -->phpLoaderModule<!-- -->: [any](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#any)<!-- -->, \
&emsp;&emsp;&emsp;<!-- -->runtime<!-- -->: [JavascriptRuntime](./php-wasm.javascriptruntime.md)<!-- -->, \
&emsp;&emsp;&emsp;<!-- -->phpModuleArgs?<!-- -->: [any](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#any)<!-- -->, \
&emsp;&emsp;&emsp;<!-- -->dataDependenciesModules?<!-- -->: [any](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#any)<!-- -->[]\
)<!-- -->: [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<!-- -->&lt;[PHP](./php-wasm.php.md)<!-- -->&gt;

* `phpLoaderModule` – The ESM-wrapped Emscripten module. Consult the Dockerfile for the build process.
* `runtime` – The current JavaScript environment. One of: NODE, WEB, or WEBWORKER.
* `phpModuleArgs` – Optional. The Emscripten module arguments, see https://emscripten.org/docs/api_reference/module.html#affecting-execution.
* `dataDependenciesModules` – Optional. A list of the ESM-wrapped Emscripten data dependency modules.
* Returns: PHP instance.


Initializes the PHP runtime with the given arguments and data dependencies.

This function handles the entire PHP initialization pipeline. In particular, it: * Instantiates the Emscripten PHP module * Wires it together with the data dependencies and loads them * Ensures is all happens in a correct order * Waits until the entire loading sequence is finished

Basic usage:

```js
 const phpLoaderModule = await import("/php.js");
 const php = await startPHP(phpLoaderModule, "web");
 console.log(php.run(`<?php echo "Hello, world!"; `));
 // { stdout: "Hello, world!", stderr: [''], exitCode: 0 }
```
**The `/php.js` module:**

In the basic usage example, `php.js` is **not** a vanilla Emscripten module. Instead, it's an ESM module that wraps the regular Emscripten output and adds some extra functionality. It's generated by the Dockerfile shipped with this repo. Here's the API it provides:

```js
// php.wasm size in bytes:
export const dependenciesTotalSize = 5644199;

// php.wasm filename:
export const dependencyFilename = 'php.wasm';

// Run Emscripten's generated module:
export default function(jsEnv, emscriptenModuleArgs) {}
```
**PHP Filesystem:**

Once initialized, the PHP has its own filesystem separate from the project files. It's provided by [Emscripten and uses its FS library](https://emscripten.org/docs/api_reference/Filesystem-API.html).

The API exposed to you via the PHP class is succinct and abstracts await certain unintuitive parts of low-level FS interactions.

Here's how to use it:

```js
// Recursively create a /var/www directory
php.mkdirTree('/var/www');

console.log(php.fileExists('/var/www/file.txt'));
// false

php.writeFile('/var/www/file.txt', 'Hello from the filesystem!');

console.log(php.fileExists('/var/www/file.txt'));
// true

console.log(php.readFile('/var/www/file.txt'));
// "Hello from the filesystem!

// Delete the file:
php.unlink('/var/www/file.txt');
```
For more details consult the PHP class directly.

**Data dependencies:**

Using existing PHP packages by manually recreating them file-by-file would be quite inconvenient. Fortunately, Emscripten provides a "data dependencies" feature.

Data dependencies consist of a `dependency.data` file and a `dependency.js` loader and can be packaged with the [file_packager.py tool]( https://emscripten.org/docs/porting/files/packaging_files.html#packaging-using-the-file-packager-tool). This project requires wrapping the Emscripten-generated `dependency.js` file in an ES module as follows:

1. Prepend `export default function(emscriptenPHPModule) {'; ` 2. Prepend `export const dependencyFilename = '<DATA FILE NAME>'; ` 3. Prepend `export const dependenciesTotalSize = <DATA FILE SIZE>;` 4. Append `}`

Be sure to use the `--export-name="emscriptenPHPModule"` file_packager.py option.

You want the final output to look as follows:

```js
export const dependenciesTotalSize = 5644199;
export const dependencyFilename = 'dependency.data';
export default function(emscriptenPHPModule) {
   // Emscripten-generated code:
   var Module = typeof emscriptenPHPModule !== 'undefined' ? emscriptenPHPModule : {};
   // ... the rest of it ...
}
```
Such a constructions enables loading the `dependency.js` as an ES Module using `import("/dependency.js")`<!-- -->.

Once it's ready, you can load PHP and your data dependencies as follows:

```js
 const [phpLoaderModule, wordPressLoaderModule] = await Promise.all([
   import("/php.js"),
   import("/wp.js")
 ]);
 const php = await startPHP(phpLoaderModule, "web", {}, [wordPressLoaderModule]);
```

