# La Perraza · Mundial 2026

Landing y panel de seguimiento de la porra del Mundial USA · México · Canadá 2026.
Web estática 100 % vanilla (HTML + CSS + JS), sin build, sin frameworks. Los
resultados se actualizan **automáticamente cada 15 min** desde
[football-data.org](https://www.football-data.org) via un cron de GitHub Actions
que reescribe `js/data.js` y recalcula la clasificación.

## Cómo arrancarla en local

El sitio se sirve con cualquier servidor HTTP estático. No basta abrir el
`index.html` con doble clic porque `js/data.js` se carga vía `<script src>` y los
navegadores aplican restricciones de origen sobre `file://`.

```powershell
# Opción 1 · Servidor PowerShell incluido (sin dependencias)
cd "C:\Web Porra La Perraza"
powershell -ExecutionPolicy Bypass -File .\.serve.ps1 -Port 8765

# Opción 2 · Python
python -m http.server 8000

# Opción 3 · Node.js
npx serve .

# Opción 4 · VS Code → extensión "Live Server" → Go Live
```

Una vez levantado: <http://localhost:8765> (o el puerto que elijas).

## Estructura del proyecto

```
.
├── index.html                  Markup semántico — sin estilos ni scripts inline
├── README.md                   Este archivo
├── package.json                Define los scripts npm (update, dry-run, verify)
├── .serve.ps1                  Servidor estático opcional (PowerShell, sin deps)
│
├── assets/
│   └── crest.png               Escudo de "La Perraza"
│
├── css/                        11 archivos, uno por sección lógica (ver "Frontend")
│
├── js/
│   ├── data.js                 Dataset completo (lo que el cron reescribe)
│   ├── helpers.js              `$`, `$$`, `esc`, `parseDay`, `N`, `TODAY`
│   ├── nav.js                  Tabs + countdown
│   ├── players.js              Panel "¿Quién es quién?"
│   ├── stats.js                Panel "Estadísticas"
│   ├── clasif.js               Panel "Clasificación"
│   ├── modal.js                Modal genérico + "apuestas por partido"
│   └── jornada.js              Panel "Próxima jornada"
│
├── scripts/                    Node 20+, sin dependencias externas
│   ├── scoring.js              Reglas de puntuación (única fuente de verdad)
│   ├── recompute.js            Recálculo de series/result_exact a partir de DATA
│   ├── data-io.js              Lectura/escritura idempotente de js/data.js
│   ├── team-mapping.json       Nombres de equipos: football-data → dataset
│   ├── update-results.js       CLI: fetch API → mutar DATA → recompute → write
│   └── verify-scoring.js       Modo lectura: imprime totales sin escribir
│
└── .github/
    └── workflows/
        └── update-results.yml  Cron */15 * * * * que ejecuta el script y hace commit
```

## Frontend (orden de carga)

- **CSS**: `base.css` (variables + reset) primero; el resto en el orden en el
  que aparecen las secciones en el DOM para preservar la cascada original.
- **JS**: todos los módulos usan `defer`. Cadena de dependencias:
  `data.js → helpers.js → nav.js → players.js → stats.js → clasif.js → modal.js → jornada.js`.

## Auto-actualización (backend en GitHub Actions)

### Cómo funciona

1. Cada 15 min, el workflow `update-results.yml` arranca un runner Ubuntu.
2. Ejecuta `node scripts/update-results.js`, que:
   - Pide a `https://api.football-data.org/v4/competitions/WC/matches?season=2026`
     todos los partidos del Mundial.
   - Para cada partido `FINISHED`:
     - Si es de fase de grupos → escribe el marcador en `DATA.matchdays[fecha]`.
     - Si es eliminatoria → añade/actualiza entrada en `DATA.ko_results`.
   - Cuando una ronda termina, **deriva** la lista de equipos clasificados a la
     siguiente (`DATA.actual_qualifiers.r16`, `.qf`, etc.) a partir de los
     ganadores reales. Para `r32` (32 clasificados de la fase de grupos) ordena
     cada grupo por puntos → diferencia → goles a favor → orden alfabético.
   - Cuando se juega la final, deriva campeón y subcampeón.
   - Llama a `recompute()`, que recorre días + fases y recalcula
     `DATA.clasif.series[player]` (cumulativo), `last_day`, `started` y el
     `result_exact` por partido.
3. Si `js/data.js` cambió, hace commit y push con el bot
   `perraza-bot@users.noreply.github.com`. Si no cambió, no hace nada.
4. GitHub Pages (o el hosting estático que uses) sirve el nuevo `data.js` y
   el frontend lo recoge en cuanto el visitante refresca.

### Setup inicial (una sola vez)

1. **Sube el repo a GitHub.** Si aún no es git: `git init && git add . && git commit -m "init" && gh repo create --public --source=. --push`.
2. **Saca clave gratuita** en <https://www.football-data.org/client/register>.
3. **Añade el secret en GitHub**: Settings → Secrets and variables → Actions →
   New repository secret → nombre `FOOTBALL_DATA_KEY`, valor: la clave.
4. **(Opcional)** si quieres apuntar a otra competición o temporada, crea las
   *variables* `FOOTBALL_DATA_COMPETITION` (por defecto `WC`) y
   `FOOTBALL_DATA_SEASON` (por defecto `2026`).
5. **Comprueba** desde Actions → "Auto-actualizar resultados y clasificación"
   → "Run workflow" para una primera ejecución manual.

### Stats reales del Mundial (pestaña "Mundial")

Reutiliza el mismo secret `FOOTBALL_DATA_KEY` del cron de resultados.
**No necesitas secrets nuevos.**

Cobertura ofrecida:
- Clasificación por grupos (12 grupos)
- Top goleadores con sus partidos jugados

NO cubierto por el free tier de football-data.org (las secciones se ocultan):
- Asistentes, tarjetas amarillas/rojas, stats por selección (goles por minuto,
  formaciones, clean sheets…)

Si necesitas esa profundidad, **API-Football Pro (~€9/mes)** sí cubre todo —
hay un comentario en `scripts/generate-stats.js` sobre cómo cambiar la fuente.

El cron `refresh-stats.yml` corre 4 veces al día (`07:07 / 13:07 / 19:07 / 01:07`
hora España). Genera `data/stats.json` y solo commitea si hay cambios.

### Probarlo en local

```powershell
# Sin escribir nada (dry-run, solo imprime cambios)
$env:FOOTBALL_DATA_KEY = "tu-clave"
node scripts/update-results.js  # añade DRY_RUN=1 si no quieres que escriba

# Confirmar que el scoring está bien (sin pedir nada a la API)
node scripts/verify-scoring.js
```

`verify-scoring.js` recalcula a partir de los resultados YA cargados en
`data.js` y te imprime el total y los primeros días de un par de porristas
conocidos — útil para confirmar tras editar `scoring.js`.

## Reglas de puntuación

Todas viven en [`scripts/scoring.js`](scripts/scoring.js). Resumen:

**Por partido (acumulativo dentro del mismo partido):**

| Ronda           | Signo | Diferencia | Exacto |
|-----------------|------:|-----------:|-------:|
| Fase de grupos  | 1     | 1          | 3      |
| 1/16 (r32)      | 2     | 2          | 3      |
| 1/8 (r16)       | 2     | 2          | 3      |
| Cuartos         | 3     | 3          | 5      |
| Semis           | 4     | 4          | 5      |
| 3º-4º puesto    | 5     | 6          | 7      |
| Final           | 5     | 6          | 7      |

> Ejemplo grupos, 2-1 firmado vs 2-1 real → 1 + 1 + 3 = **5 pts**.
> En partido **triple** (lista en `DATA.gp_matches[i].triple`): × 3 = 15.

**Por equipo clasificado (cada equipo de la lista del player que realmente pasó):**

| Lista (`bets.X`)      | Concepto                | Pts/equipo |
|-----------------------|-------------------------|-----------:|
| `r32`                 | Clasif. a 1/16          | 10         |
| `r16`                 | Clasif. a octavos       | 15         |
| `qf`                  | Clasif. a cuartos       | 20         |
| `sf`                  | Clasif. a semis         | 30         |
| `sf` (perdedores)     | Clasif. a 3º-4º puesto  | 40         |
| `final`               | Clasif. a final         | 50         |

**Premios al cierre del Mundial:**

| Premio           | Pts | Premio           | Pts |
|------------------|----:|------------------|----:|
| Campeón          | 60  | Balón de Oro     | 20  |
| Subcampeón       | 50  | Balón de Plata   | 15  |
| 3º puesto        | 40  | Balón de Bronce  | 10  |
| Bota de Oro      | 20  | Bota de Plata    | 15  |
| Bota de Bronce   | 10  |                  |     |

### Pendiente: "Posición exacta (1º/2º/3º/4º)" de la fase de grupos

La tabla original incluye una regla de 5 pts por cada posición exacta del
porrista dentro de cada grupo (1º, 2º, 3º, 4º). El dataset actual **no guarda**
el ranking por grupo que firmó cada porrista — sólo guarda la lista r32 (qué 32
equipos pasarán a 1/16). Cuando añadáis ese campo (por ejemplo
`p.bets.group_standings[group_letter] = [1º, 2º, 3º, 4º]`), añadid el bloque
correspondiente en `recompute.js` (los puntos por posición ya están comentados
en `scoring.js` para que sólo haya que descomentar).

## Mantenimiento

- **Editar reglas**: toca [`scripts/scoring.js`](scripts/scoring.js) y vuelve a
  correr el cron (o `node scripts/update-results.js` localmente). Recomputa todo
  desde cero, así que el cambio se propaga a toda la serie histórica.
- **Resultados manuales**: si la API se cae o devuelve datos viejos, edita
  directamente `js/data.js` (campo `result` del partido) y haz commit. El cron
  no sobrescribirá un marcador correcto.
- **Nuevos equipos / variantes de nombre**: añade entradas a
  [`scripts/team-mapping.json`](scripts/team-mapping.json). El log del cron
  imprime los equipos sin reconocer.
- **Cadencia del cron**: el workflow se **auto-encadena**. Al final de cada
  ejecución duerme 15 min y se re-dispara a sí mismo via API. Cada run encadena
  la siguiente; cadencia exacta sin depender del scheduler de GitHub Actions
  (que en free tier descarta la mayoría de `schedule` events).
  El paso de re-dispatch solo se activa si el secret `PAT_DISPATCH` está
  configurado; sin él, el workflow vuelve a entrar solo cuando alguno de los
  4 `cron:` declarados consiga arrancar (red de seguridad).

### Configurar el PAT de auto-encadenado (una sola vez)

1. <https://github.com/settings/personal-access-tokens/new> → "Generate new token"
   → Fine-grained.
2. **Resource owner**: tu usuario.
   **Repository access**: "Only select repositories" → marca `World-Cup-La-Perraza-2026`.
3. **Permissions** → expande "Repository permissions" → busca **`Actions`** y
   ponlo en **`Read and write`**. Nada más.
4. **Expiration**: el máximo que te deje (1 año típicamente).
5. Generate token → copia el `github_pat_…`.
6. <https://github.com/McDieguete/World-Cup-La-Perraza-2026/settings/secrets/actions/new>
   → Name: `PAT_DISPATCH`, Secret: pega el token → Add secret.

A partir de la siguiente ejecución manual del workflow, el bucle queda en marcha
indefinidamente (cada run dispara el siguiente). Si quieres pararlo: borra el
secret `PAT_DISPATCH` — la cadena se detiene en el próximo ciclo.
  Recuerda que el free tier de football-data.org es 10 req/min — no bajes de 6 min.
- **Paleta**: `:root` en `css/base.css`.
- **Tipografías**: Google Fonts (Anton, Outfit, Space Mono) declaradas en `<head>`.
