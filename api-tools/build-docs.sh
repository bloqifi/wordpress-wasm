#!/bin/bash

# Run from the repo root
npx tsc -p packages/php-wasm/tsconfig.json;
npx tsc -p packages/php-wasm-browser/tsconfig.json;
npx tsc -p packages/php-wasm-browser/tsconfig.worker.json;
npx tsc -p packages/wordpress-wasm/tsconfig.json;
npx tsc -p packages/wordpress-wasm/tsconfig.worker.json;

for i in $(ls packages/*/api-extractor*.json); do
    node ./api-tools/api-extractor.js run -c $i --local --verbose;
done;

# Rebuild API documenter
# cd ../api-documenter && npm run build && cd ../wasm

rm temp/*; 
node ./api-tools/merge-extracted-apis.js ./packages/php-wasm/build-api/*.json > temp/php-wasm.api.json; 
node ./api-tools/merge-extracted-apis.js ./packages/php-wasm-browser/build-api/*.json > temp/php-wasm-browser.api.json; 
node ./api-tools/merge-extracted-apis.js ./packages/wordpress-wasm/build-api/*.json > temp/wordpress-wasm.api.json; 
node api-tools/api-documenter.js markdown -i temp -o temp-mdq
