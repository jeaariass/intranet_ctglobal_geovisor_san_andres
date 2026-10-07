# -*- coding: utf-8 -*-
"""
Extractor de las tablas "Planta propuesta <dependencia>" del Anexo 2 (PDF)
+ armado del dataset consultable (CSV / SQLite / GeoJSON).

FUENTE PRIMARIA del recuento por dependencia:
  PDF ANEXO 2, secciones 5.x "Propuesta de ajuste de planta — <dep>",
  tablas con columnas: Nivel | Denominación | Planta actual (Dto 0782/0783) |
  Planta propuesta | Variación | Código | Grado | Perfil | Experiencia.

Estrategia de parseo: find_tables() -> colapsar cada fila a celdas no vacías ->
parseo posicional (robusto ante el nº variable de columnas por celdas combinadas).

QA: por dependencia se compara  suma de filas  vs  fila TOTAL del documento.
Varios TOTAL del PDF tienen errores aritméticos propios (typos de la fuente):
se conservan ambos valores y se marca `coincide_doc`.
"""
import fitz, re, json, os, sqlite3, csv, unicodedata, sys
try: sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception: pass

BASE   = r"C:\Users\Jesus\Documents\GEOBIOMAS\GEOVISORES\BASE_GEOVISORES\SAN ANDRES"
SRCDIR = os.path.join(BASE, "INFORMACION_BASE")
OUT    = os.path.join(BASE, "datos_planta")
PDF    = os.path.join(SRCDIR, "ANEXO 2 FASE 3 CO1.PCCNTR.7884694 RV F.pdf")
XL_CAR = os.path.join(SRCDIR, "Anexo 4 CARGOS SUGERIDOS CO1.PCCNTR.7884694 (1).xlsx")
XL_782 = os.path.join(SRCDIR, "planta 0782.xlsx")

doc = fitz.open(PDF)

def norm(s):  return re.sub(r"\s+", " ", ("" if s is None else str(s)).replace("\n", " ")).strip()
def deacc(s): return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))
def slug(s):  return re.sub(r"[^a-z0-9]+", "_", deacc(norm(s)).lower()).strip("_")
def nz(s):    return re.sub(r"[^a-z0-9]", "", deacc(norm(s)).lower())
INT = re.compile(r"^-?\d{1,4}$")
def is_int(x): return bool(INT.match(norm(x)))
def to_int(x): return int(norm(x)) if is_int(x) else None

# ---------------- anclas -------------------------------------------------
H1        = re.compile(r"^\s*5\.\d+(?:\.\d+)?\s+Propuesta de ajuste de planta\s+[—-]\s+(.+)$", re.I)
INDER_RX  = re.compile(r"Planta de personal propuesta del INDER", re.I)
CONTR_RX  = re.compile(r"Planta propuesta\s+Oficina de Contrataci", re.I)
anchors = []
for i in range(5, len(doc)):
    for ln in doc[i].get_text().splitlines():
        s = ln.strip()
        m = H1.match(s)
        if m: anchors.append((norm(m.group(1)), i)); continue
        if INDER_RX.search(s): anchors.append(("INDER ISLAS", i)); continue
        if CONTR_RX.search(s) and len(s) < 90: anchors.append(("Oficina de Contratación", i))
seen, ANCH = set(), []
for name, pg in sorted(anchors, key=lambda x: x[1]):
    k = slug(name)
    if k in seen: continue
    seen.add(k); ANCH.append((name, pg))
print("Dependencias ancladas:", len(ANCH))

# ---------------- detección de tablas ---------------------------------
def is_letterhead(rows):
    j = " ".join(norm(c) for r in rows for c in r).upper()
    return "ALCANCE 3" in j or "CONTRATANTE" in j
def is_finance(rows):
    j = " ".join(norm(c) for r in rows[:2] for c in r).lower()
    return ("2024" in j and "2025" in j) or "prestación de servicios" in j
def header_kind(cells):
    j = nz(" ".join(norm(c) for c in cells))
    if "denominaci" not in j or "grado" not in j: return None
    if "grupointerno" in j or j[:3] == "git" or "medicionde" in j or "tiempo" in j: return None
    if "propu" in j and ("actual" in j or "planta" in j): return "AP"
    if "cargos" in j and "propu" not in j: return "N"
    return None

VAR = re.compile(r"^\s*([=+\-]?)\s*(\d+)?")
def split_var(txt):
    t = norm(txt); m = VAR.match(t)
    sign, num = (m.group(1) or ""), m.group(2)
    if sign == "=" or (not sign and not num): delta = 0
    elif num: delta = int(num) * (-1 if sign == "-" else 1)
    else: delta = None
    return delta, t[m.end():].strip(" .:-—")

# códigos de empleo DAFP presentes en la planta / estudio San Andrés
KNOWN_COD = {6, 9, 20, 105, 115, 201, 202, 203, 214, 215, 219, 222, 233, 234, 243,
             290, 312, 314, 336, 338, 340, 407, 411, 413, 417, 418, 419, 425,
             470, 472, 475, 480, 485}

def _cg(cells, ii):
    """índice (codigo, grado): par contiguo de enteros, grado 8-30, codigo en KNOWN_COD."""
    cand = []
    for x in range(len(ii) - 1):
        if x < 1: continue
        c1, c2 = to_int(cells[ii[x]]), to_int(cells[ii[x + 1]])
        if ii[x + 1] - ii[x] <= 4 and c1 is not None and c2 is not None and 8 <= c2 <= 30:
            cand.append((ii[x], ii[x + 1], c1))
    if not cand:
        return None
    known = [c for c in cand if c[2] in KNOWN_COD]
    pick = (known[-1] if known else cand[-1])
    return pick[0], pick[1]

def _head_txt(r, upto):
    return [c for c in (norm(x) for x in r[:upto]) if c and not is_int(c)]

def parse_AP(r, nivel_prev):
    """r = fila cruda (celdas '' incluidas). Devuelve dict con _gi (índice col Grado)."""
    ii = [k for k, c in enumerate(r) if is_int(c)]
    if len(ii) < 4: return None
    cg = _cg(r, ii)
    if not cg: return None
    cod_i, gra_i = cg
    pre = [k for k in ii if k < cod_i]
    if len(pre) < 2: return None
    actual, propuesta = to_int(r[pre[0]]), to_int(r[pre[1]])
    var = norm(" ".join(r[pre[1] + 1: cod_i]))
    head = _head_txt(r, pre[0])
    nivel, denom = nivel_prev, ""
    if len(head) >= 2: nivel, denom = head[0], " ".join(head[1:])
    elif head:         denom = head[0]
    delta, nota = split_var(var)
    return dict(nivel=nivel, denominacion=denom, codigo=norm(r[cod_i]), grado=to_int(r[gra_i]),
               planta_actual=actual, planta_propuesta=propuesta,
               variacion=var, variacion_delta=delta, variacion_nota=nota, _gi=gra_i)

def parse_N(r, nivel_prev):
    ii = [k for k, c in enumerate(r) if is_int(c)]
    if len(ii) < 3: return None
    cg = _cg(r, ii)
    if not cg: return None
    cod_i, gra_i = cg
    pre = [k for k in ii if k < cod_i]
    if not pre: return None
    n = to_int(r[pre[-1]])
    head = _head_txt(r, pre[-1])
    nivel, denom = nivel_prev, ""
    if len(head) >= 2: nivel, denom = head[0], " ".join(head[1:])
    elif head:         denom = head[0]
    return dict(nivel=nivel, denominacion=denom, codigo=norm(r[cod_i]), grado=to_int(r[gra_i]),
               planta_actual=0, planta_propuesta=n,
               variacion="+%s" % n, variacion_delta=n, variacion_nota="", _gi=gra_i)

def col_map(rows):
    """Índices de columnas Perfil/Experiencia/Dependencia/Función si la tabla trae encabezado."""
    for r in rows[:3]:
        j = [nz(x) for x in r]
        if any("denominaci" in c for c in j) and any("grado" in c for c in j):
            m = {"_w": len(r)}
            for i, c in enumerate(j):
                if "perfil" in c: m.setdefault("perfil", i)
                elif "experiencia" in c: m.setdefault("exp", i)
                elif c == "dependencia" or "subdependencia" in c: m.setdefault("drop", i)
                elif "funcion" in c: m.setdefault("drop2", i)
            return m
    return None

def perfil_exp(col_text, hm):
    """col_text = {colidx: [textos]} de celdas a la derecha de Grado."""
    if not col_text: return "", ""
    if hm and "exp" in hm and hm["exp"] in col_text:
        drop = {hm.get("exp"), hm.get("drop"), hm.get("drop2")}
        pe = " ".join(col_text.get(hm["exp"], []))
        pf = " ".join(t for ci in sorted(col_text) if ci not in drop for t in col_text[ci])
        return norm(pf), norm(pe)
    mx = max(col_text)
    pe = " ".join(col_text[mx])
    pf = " ".join(t for ci in sorted(col_text) if ci < mx for t in col_text[ci])
    return norm(pf), norm(pe)

def parse_dep(name, pg, pg_end):
    tables = []
    for p in range(pg, min(pg_end, len(doc))):
        for t in doc[p].find_tables().tables:
            rows = t.extract()
            if rows and not is_letterhead(rows) and not is_finance(rows):
                tables.append((p + 1, [[norm(c) for c in r] for r in rows]))
    kind = None
    for _, rows in tables:
        for r in rows[:2]:
            k = header_kind(r)
            if k: kind = k; break
        if kind: break
    if not kind:
        return [], None, None
    parse = parse_AP if kind == "AP" else parse_N
    recs, total, nivel_cur = [], None, ""
    pend, pend_gi, pcols = None, None, {}   # cargo en curso + acumulador perfil/exp

    def flush(hm):
        if pend is None: return
        pf, pe = perfil_exp(pcols, hm)
        pend["perfil_requerido"], pend["experiencia"] = pf, pe
        pend.pop("_gi", None)
        recs.append(pend)

    for pnum, rows in tables:
        hm = col_map(rows)
        if hm is None and recs:  # tabla de continuación sin encabezado
            hm = parse_dep._last_hm
        parse_dep._last_hm = hm
        for r in rows:
            cells = [c for c in r if c]
            if not cells: continue
            if header_kind(r): continue
            if cells[0].upper().startswith("TOTAL"):
                flush(hm)
                nums = [to_int(c) for c in cells if is_int(c)]
                if kind == "AP" and len(nums) >= 2: total = (nums[0], nums[1])
                elif nums:                          total = (0, nums[0])
                return recs, total, kind
            d = parse(r, nivel_cur)
            if d:
                flush(hm)
                if d["nivel"] and not is_int(d["nivel"]) and len(d["nivel"]) < 24:
                    nivel_cur = d["nivel"]
                else:
                    d["nivel"] = nivel_cur
                d.update(dependencia=name, dependencia_slug=slug(name), pagina_pdf=pnum,
                         fuente="ANEXO2_PDF")
                pend, pend_gi, pcols = d, d["_gi"], {}
                for ci, txt in enumerate(r):
                    if ci > pend_gi and norm(txt):
                        pcols.setdefault(ci, []).append(norm(txt))
            elif pend is not None:   # fila de continuación → texto de perfil/experiencia
                for ci, txt in enumerate(r):
                    if ci > pend_gi and norm(txt):
                        pcols.setdefault(ci, []).append(norm(txt))
    flush(parse_dep._last_hm)
    return recs, total, kind
parse_dep._last_hm = None

cargos, resumen = [], []
for idx, (name, pg) in enumerate(ANCH):
    pg_end = min(ANCH[idx + 1][1] if idx + 1 < len(ANCH) else pg + 9, pg + 9)
    recs, total, kind = parse_dep(name, pg, pg_end)
    sa = sum(r["planta_actual"] or 0 for r in recs)
    sp = sum(r["planta_propuesta"] or 0 for r in recs)
    ta, tp = (total if total else (None, None))
    coincide = bool(total) and tp == sp and (ta in (None, 0, sa) or kind == "N")
    resumen.append(dict(dependencia=name, dependencia_slug=slug(name),
        planta_actual_filas=sa, planta_propuesta_filas=sp, delta_filas=sp - sa,
        planta_actual_doc=ta, planta_propuesta_doc=tp,
        coincide_doc=coincide, n_lineas=len(recs),
        pagina_pdf=recs[0]["pagina_pdf"] if recs else None, tipo_tabla=kind))
    cargos += recs

# ---------------- auxiliares desde Excel -------------------------------
import openpyxl
def xrows(path, sheet, cap=400):
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    ws = wb[sheet] if sheet in wb.sheetnames else next((wb[s] for s in wb.sheetnames if slug(sheet) in slug(s)), wb.worksheets[0])
    out = []
    for i, r in enumerate(ws.iter_rows(values_only=True)):
        out.append(r)
        if i > cap: break
    wb.close(); return out

def num(v):
    if v is None or v == "": return None
    if isinstance(v, (int, float)): return v
    t = str(v).replace(".", "").replace(",", ".")
    try: return float(t) if "." in t else int(t)
    except ValueError: return None

def parse_simple(rows, label):
    hi = next(k for k, r in enumerate(rows) if any(isinstance(c, str) and "DENOMINACI" in c.upper() for c in r))
    hdr = [norm(c) for c in rows[hi]]
    def col(*ks):
        for i, c in enumerate(hdr):
            if any(k in deacc(c).upper() for k in ks): return i
        return None
    ci = dict(niv=col("NIVEL"), den=col("DENOMINACI"), cod=col("CODIGO", "DIGO"), gra=col("GRADO"),
              n=col("N CARGOS", "N� CARGOS", "CARGOS", "TOTAL"),
              cu=col("COSTO UNITARIO", "COSTO MENSUAL"), cm=col("TOTAL MENSUAL"), ca=col("TOTAL ANUAL"))
    res = []
    for r in rows[hi + 1:]:
        den = norm(r[ci["den"]]) if ci["den"] is not None and len(r) > ci["den"] else ""
        if not den or den.upper().startswith("TOTAL"): continue
        g = lambda k: (r[ci[k]] if ci[k] is not None and len(r) > ci[k] else None)
        res.append(dict(grupo=label, nivel=norm(g("niv")), denominacion=den, codigo=norm(g("cod")),
                        grado=norm(g("gra")), n_cargos=num(g("n")),
                        costo_unitario=num(g("cu")), costo_total_mensual=num(g("cm")), costo_total_anual=num(g("ca"))))
    return res

costo    = parse_simple(xrows(XL_CAR, "COSTO CARGO"), "costo_cargo")
suprimir = parse_simple(xrows(XL_CAR, "SUPRIMIR"), "suprimir")
inder_xl = parse_simple(xrows(XL_CAR, "CARGOS INDER ISLAS"), "inder_islas")

rows0 = xrows(XL_782, "0782")
planta0782, nivel = [], ""
for r in rows0[1:]:
    den = norm(r[1]) if len(r) > 1 else ""
    niv = norm(r[0]) if len(r) > 0 else ""
    if niv: nivel = niv
    if not den or den.upper().startswith("TOTAL"): continue
    planta0782.append(dict(nivel_jerarquico=nivel, denominacion=den, codigo=norm(r[2]),
                           grado=norm(r[3]), total=num(r[4]) if len(r) > 4 else None))

# ---------------- dependencias.csv (preserva coords) ------------------
depfile = os.path.join(OUT, "dependencias.csv")
prev = {}
if os.path.exists(depfile):
    with open(depfile, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            prev[row.get("dependencia_slug") or slug(row.get("dependencia", ""))] = row
deps = []
for rz in resumen:
    p = prev.get(rz["dependencia_slug"], {})
    deps.append(dict(dependencia=rz["dependencia"], dependencia_slug=rz["dependencia_slug"],
        lat=p.get("lat", ""), lon=p.get("lon", ""), direccion=p.get("direccion", ""),
        sede=p.get("sede", ""), piso=p.get("piso", ""),
        fuente_ubicacion=p.get("fuente_ubicacion", ""), notas=p.get("notas", "")))

# ---------------- writers --------------------------------------------
os.makedirs(OUT, exist_ok=True)
def wcsv(name, rows, fields=None):
    if not rows: return
    fields = fields or list(rows[0].keys())
    with open(os.path.join(OUT, name), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fields); w.writeheader()
        for r in rows: w.writerow({k: r.get(k, "") for k in fields})
    print("   ", name, len(rows))

wcsv("cargos_por_dependencia.csv", cargos)
wcsv("resumen_por_dependencia.csv", resumen)
wcsv("planta_0782.csv", planta0782)
wcsv("costo_cargo.csv", costo)
wcsv("cargos_suprimir.csv", suprimir)
wcsv("cargos_inder_islas.csv", inder_xl)
wcsv("dependencias.csv", deps)

db = os.path.join(OUT, "planta_sanandres.sqlite")
if os.path.exists(db): os.remove(db)
con = sqlite3.connect(db); cur = con.cursor()
def tbl(name, rows):
    if not rows: return
    cols = list(rows[0].keys())
    cur.execute("CREATE TABLE %s (%s)" % (name, ",".join('"%s"' % c for c in cols)))
    cur.executemany("INSERT INTO %s VALUES (%s)" % (name, ",".join("?" * len(cols))),
                    [[r.get(c) for c in cols] for r in rows])
tbl("cargos_por_dependencia", cargos)
tbl("resumen_por_dependencia", resumen)
tbl("planta_0782", planta0782)
tbl("costo_cargo", costo)
tbl("cargos_suprimir", suprimir)
tbl("cargos_inder_islas", inder_xl)
tbl("dependencias", deps)
cur.execute("""CREATE VIEW v_dependencia_geo AS
 SELECT r.dependencia, r.dependencia_slug, r.planta_actual_filas, r.planta_propuesta_filas,
        r.delta_filas, r.coincide_doc, d.lat, d.lon, d.direccion, d.sede
 FROM resumen_por_dependencia r LEFT JOIN dependencias d USING(dependencia_slug)""")
con.commit(); con.close()
print("    planta_sanandres.sqlite")

fc = dict(type="FeatureCollection", name="dependencias_planta_sanandres", features=[])
for rz in resumen:
    d = next((x for x in deps if x["dependencia_slug"] == rz["dependencia_slug"]), {})
    geom = None
    try:
        if d.get("lat") and d.get("lon"):
            geom = dict(type="Point", coordinates=[float(d["lon"]), float(d["lat"])])
    except ValueError:
        pass
    fc["features"].append(dict(type="Feature", geometry=geom, properties=dict(
        dependencia=rz["dependencia"], slug=rz["dependencia_slug"],
        planta_actual=rz["planta_actual_filas"], planta_propuesta=rz["planta_propuesta_filas"],
        delta=rz["delta_filas"], coincide_doc=rz["coincide_doc"], pagina_pdf=rz["pagina_pdf"])))
with open(os.path.join(OUT, "dependencias.geojson"), "w", encoding="utf-8") as f:
    json.dump(fc, f, ensure_ascii=False, indent=1)
print("    dependencias.geojson")
with open(os.path.join(OUT, "planta_sanandres.json"), "w", encoding="utf-8") as f:
    json.dump(dict(cargos_por_dependencia=cargos, resumen_por_dependencia=resumen,
                   planta_0782=planta0782, costo_cargo=costo, suprimir=suprimir,
                   inder_islas=inder_xl, dependencias=deps), f, ensure_ascii=False, indent=1)
print("    planta_sanandres.json")

# ---------------- QA ------------------------------------------------
print(f"\n{'dependencia':<40}{'filas a/p':>11}{'doc a/p':>11}   estado")
bad = []
for rz in resumen:
    fa = f"{rz['planta_actual_filas']}/{rz['planta_propuesta_filas']}"
    da = f"{rz['planta_actual_doc']}/{rz['planta_propuesta_doc']}"
    st = "OK" if rz["coincide_doc"] else "REVISAR"
    if not rz["coincide_doc"]: bad.append(rz["dependencia"])
    print(f"{rz['dependencia'][:39]:<40}{fa:>11}{da:>11}   {st}")
tot_a = sum(r["planta_actual_filas"] for r in resumen)
tot_p = sum(r["planta_propuesta_filas"] for r in resumen)
print(f"\nTOTAL filas: actual {tot_a}  propuesta {tot_p}  delta {tot_p-tot_a}")
print(f"{len(resumen)-len(bad)}/{len(resumen)} cuadran con su TOTAL de documento")
print("REVISAR:", ", ".join(bad))
