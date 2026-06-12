/* ===========================================================
   data-io.js — Lectura y escritura idempotente de js/data.js
   --------------------------------------------------------------
   El navegador necesita js/data.js como un script clásico que
   defina `const DATA = {...}; window.DATA = DATA;`.
   Este módulo:
     · readDataJs()  → devuelve el objeto DATA (JSON puro).
     · writeDataJs(obj) → reescribe el archivo manteniendo el
       envoltorio y serializando el contenido en UNA línea (igual
       que el artefacto original).
   =========================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'js', 'data.js');

const HEADER = '/* ===========================================================\r\n' +
               '   data.js - dataset completo de la porra (81 quinielas + meta)\r\n' +
               '   Se expone como window.DATA para el resto de modulos.\r\n' +
               '   =========================================================== */\r\n\r\n';
const FOOTER = '\r\nwindow.DATA = DATA;\r\n';

/** Lee js/data.js y devuelve el objeto JSON parseado. */
function readDataJs() {
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  const m = raw.match(/const\s+DATA\s*=\s*(\{[\s\S]*\})\s*;\s*[\r\n]+\s*window\.DATA/);
  if (!m) throw new Error('No se pudo localizar el objeto DATA en js/data.js');
  return JSON.parse(m[1]);
}

/** Sobrescribe js/data.js con el objeto dado.
 *  Mantiene la cabecera, el `const DATA = ...` en una línea y el footer.
 *  Devuelve true si el contenido cambió respecto al disco; false si era igual. */
function writeDataJs(obj) {
  const json = JSON.stringify(obj);
  const next = HEADER + 'const DATA = ' + json + ';' + FOOTER;
  let prev = null;
  try { prev = fs.readFileSync(DATA_PATH, 'utf8'); } catch (_) { /* primera vez */ }
  if (prev === next) return false;
  fs.writeFileSync(DATA_PATH, next, 'utf8');
  return true;
}

module.exports = { readDataJs, writeDataJs, DATA_PATH };
