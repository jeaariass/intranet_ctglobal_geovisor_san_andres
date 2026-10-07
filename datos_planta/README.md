# datos_planta — Rediseño Planta de Personal San Andrés

Datos del estudio técnico (Contrato CI-SGE-0005-2025 / CO1.PCCNTR.7884694)
convertidos a formato **consultable** para alimentar el geovisor.

Genera todo: `python extract_pdf.py` (requiere `pymupdf` y `openpyxl`).
Regenerable; **preserva** las coordenadas ya cargadas en `dependencias.csv`.

---

## Fuente primaria: el PDF, no los Excel

El recuento **planta actual (Dto 0782/0783) vs planta propuesta, por cargo y
dependencia** vive en el **PDF `ANEXO 2 FASE 3 ...`**, en las ~26 tablas
`Planta propuesta <dependencia>` (secciones 5.x "Propuesta de ajuste de planta").
Columnas: `Nivel · Denominación · Planta actual · Planta propuesta · Variación · Código · Grado · Perfil · Experiencia`.

Los Excel `Anexo 4 CARGOS SUGERIDOS` **no** sirven para esto: sus matrices son un
resumen recortado (total 324 = Tabla 128, solo personal operativo GIT, sin
directivos ni INDER). Solo se usan para `COSTO CARGO`, `SUPRIMIR` e `INDER ISLAS`.

### Método de extracción
`fitz.find_tables()` por página → cada fila se colapsa a celdas no vacías →
parseo posicional (robusto ante el nº variable de columnas que generan las celdas
combinadas del Word). Código de empleo validado contra lista DAFP conocida.

### QA — se compara suma de filas vs fila TOTAL del documento
**17 de 26 dependencias cuadran exacto.** Las otras 9 quedan marcadas
`coincide_doc = False` con su `pagina_pdf` para revisión manual.
**Varias son errores aritméticos del propio PDF**, no de la extracción:
p.ej. Secretaría Privada (p70) — las filas suman propuesta 8, el TOTAL impreso
dice 7 y la Variación dice +2; Mujer (p316) — filas suman 14, Variación dice +5
(9+5=14), TOTAL impreso dice 11. Eso es hallazgo de la revisión documental.

| Dependencia | pág PDF | filas a/p | doc a/p | nota |
|---|---|---|---|---|
| Control Interno de Gestión | 35 | 5/9 | 4/8 | verificar |
| Secretaría Privada | 70 | 6/8 | 6/7 | **typo del PDF** (Var +2) |
| Secretaría de Hacienda | 90 | 27/38 | 27/39 | verificar 1 cargo |
| Secretaría de Educación | 129 | 20/28 | 20/27 | verificar 1 cargo |
| Secretaría de Movilidad | 208 | 27/43 | 27/42 | verificar 1 cargo |
| Secretaría de Infraestructura | 229 | 22/38 | 23/38 | verificar 1 cargo |
| Servicios Públicos y Medio Ambiente | 244 | 6/24 | 6/23 | verificar 1 cargo |
| Mujer y Equidad de Género | 316 | 9/14 | 9/11 | **typo del PDF** (Var +5) |
| Oficina de Contratación | 343 | 0/6 | — | el PDF no trae fila TOTAL |

---

## Archivos

| Archivo | Contenido |
|---|---|
| `cargos_por_dependencia.csv` | **390 filas.** 1 fila por cargo/grado/dependencia: `nivel, denominacion, codigo, grado, planta_actual, planta_propuesta, variacion, variacion_delta, variacion_nota, dependencia, dependencia_slug, pagina_pdf, fuente, perfil_requerido, experiencia` |
| `resumen_por_dependencia.csv` | **26 filas.** `planta_actual_filas, planta_propuesta_filas, delta_filas, planta_actual_doc, planta_propuesta_doc, coincide_doc, n_lineas, pagina_pdf, tipo_tabla`. **Tabla base del mapa** |
| `planta_0782.csv` | Planta legal global Decreto 0782/2023 (70 líneas, sin desglose por dependencia) |
| `costo_cargo.csv` | Costo mensual por denominación/código/grado (del Excel) |
| `cargos_suprimir.csv` | 17 cargos a suprimir (1 guardián, 4 bomberos, 12 cabos) |
| `cargos_inder_islas.csv` | Planta propuesta INDER/IDRD SAI — 25 cargos (entidad descentralizada) |
| `dependencias.csv` | **Skeleton georreferenciación** — 26 filas, `lat, lon, direccion, sede, piso, fuente_ubicacion, notas` vacías |
| `planta_sanandres.sqlite` | Todas las tablas + vista `v_dependencia_geo` (resumen ↔ coords) |
| `planta_sanandres.json` | Todo en un JSON |
| `dependencias.geojson` | 1 feature por dependencia, `geometry:null` hasta cargar coords; props: planta_actual, planta_propuesta, delta, coincide_doc, pagina_pdf |
| `extract_pdf.py` | El extractor/builder |

Clave de unión en todo: **`dependencia_slug`**.

### Totales (26 dependencias del estudio, tablas del PDF)
- planta actual ≈ **501** · planta propuesta ≈ **821** · delta ≈ **+320**
- (incluye directivos; INDER +25 y supresiones aparte. No confundir con el 324 del Excel/Tabla 128)

---

## Georreferenciar (paso siguiente)

1. Llenar `lat`, `lon` (grados decimales WGS84), `direccion`, `sede`, `piso` en
   `dependencias.csv`. Anotar origen en `fuente_ubicacion`.
2. Volver a correr `python extract_pdf.py` → completa `geometry` en
   `dependencias.geojson` y la vista SQLite. No pisa lo ya cargado.
3. El geovisor carga `dependencias.geojson` como capa de puntos; popup con
   planta actual / propuesta / delta y link al detalle (`cargos_por_dependencia`
   filtrado por `dependencia_slug`).

> Despachos que comparten sede (edificio Coral Palace / Gobernación): repetir
> lat/lon y diferenciar con `piso`.
> Despacho del Gobernador no tiene tabla de ajuste (sin cambios); su planta está
> en `planta_0782.csv`.

---

## Avisos

- `codigo` "020", "009" = texto con ceros a la izquierda (norma DAFP). Se conserva.
- Decreto **0782/2023** adopta la planta; **0783/2023** el Manual de Funciones.
  El Anexo 2 rotula sus tablas indistintamente.
- Filas de las 9 dependencias `coincide_doc=False`: usar con cautela hasta
  verificar contra la página del PDF.
- INDER y Contratación: tablas tipo "N° cargos" (sin columna planta actual);
  `planta_actual=0`.
- `perfil_requerido` / `experiencia`: texto tomado de las 2 últimas columnas de
  cada tabla del PDF, reensamblado desde las filas de continuación. Puede traer
  artefactos de guionado ("Contadu ría") u OCR. En Oficina de Contratación la
  columna "Función principal" se mezcla parcialmente con `experiencia`.

_Última actualización: 2026-08-31 — extracción desde PDF Anexo 2, sin coordenadas cargadas._
