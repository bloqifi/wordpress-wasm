cd packages/php-wasm && rm -rf build-types/* && npx tsc -b --force && ll build-types && cd ../../ && node ./api-tools/api-extractor.js run --local --verbose
 
cd ../api-documenter && npm run build && cd ../wasm && node api-tools/api-documenter.js markdown -i temp -o temp-mdq
