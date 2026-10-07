import {build} from 'esbuild';
await build({entryPoints:['content-calendar/src/main.tsx'],bundle:true,minify:true,format:'esm',target:['es2022'],jsx:'automatic',outfile:'content-calendar/board.js',define:{'process.env.NODE_ENV':'"production"'}});
console.log('Built content-calendar/board.js');
