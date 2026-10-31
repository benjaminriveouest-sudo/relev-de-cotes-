// Copie dans public/pdfjs/ ce dont pdf.js a besoin pour lire tous les PDF, y compris hors ligne :
// décodeurs d'images scannées et polices standard. Lancé tout seul avant `npm run dev` et `npm run build`.
import { cpSync, mkdirSync } from 'node:fs'

const source = 'node_modules/pdfjs-dist'
const cible = 'public/pdfjs'

mkdirSync(`${cible}/wasm`, { recursive: true })
for (const fichier of ['jbig2.wasm', 'openjpeg.wasm', 'qcms_bg.wasm']) cpSync(`${source}/wasm/${fichier}`, `${cible}/wasm/${fichier}`)
cpSync(`${source}/standard_fonts`, `${cible}/standard_fonts`, { recursive: true })
