from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


OUT = Path(__file__).with_name("erd-sistema-documental.png")
W, H = 6800, 5260
PANEL_W, PANEL_H = 3250, 2310
MARGIN_X, TOP = 100, 240
GAP_X, GAP_Y = 100, 100


def font(size, bold=False, mono=False):
    candidates = []
    if mono:
        candidates += [
            r"C:\Windows\Fonts\consola.ttf" if not bold else r"C:\Windows\Fonts\consolab.ttf",
            r"C:\Windows\Fonts\lucon.ttf",
        ]
    else:
        candidates += [
            r"C:\Windows\Fonts\segoeui.ttf" if not bold else r"C:\Windows\Fonts\segoeuib.ttf",
            r"C:\Windows\Fonts\arial.ttf" if not bold else r"C:\Windows\Fonts\arialbd.ttf",
        ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


F_TITLE = font(62, bold=True)
F_SUBTITLE = font(28)
F_PANEL = font(35, bold=True)
F_ENTITY = font(25, bold=True, mono=True)
F_FIELD = font(21, mono=True)
F_SMALL = font(20)
F_CARD = font(18, bold=True)


class Entity:
    def __init__(self, key, title, fields, x, y, w=590, reference=False):
        self.key = key
        self.title = title
        self.fields = fields
        self.x = x
        self.y = y
        self.w = w
        self.reference = reference
        self.header_h = 56
        self.row_h = 32
        self.h = self.header_h + 18 + self.row_h * len(fields)

    @property
    def box(self):
        return (self.x, self.y, self.x + self.w, self.y + self.h)

    @property
    def center(self):
        return (self.x + self.w / 2, self.y + self.h / 2)


def dashed_line(draw, points, fill="black", width=4, dash=18, gap=12):
    for a, b in zip(points, points[1:]):
        x1, y1 = a
        x2, y2 = b
        dx, dy = x2 - x1, y2 - y1
        length = (dx * dx + dy * dy) ** 0.5
        if not length:
            continue
        ux, uy = dx / length, dy / length
        pos = 0
        while pos < length:
            end = min(pos + dash, length)
            draw.line(
                (x1 + ux * pos, y1 + uy * pos, x1 + ux * end, y1 + uy * end),
                fill=fill,
                width=width,
            )
            pos += dash + gap


def draw_polyline(draw, points, dashed=False, width=4):
    if dashed:
        dashed_line(draw, points, width=width)
    else:
        draw.line(points, fill="black", width=width, joint="curve")


def connection_points(parent, child):
    px, py = parent.center
    cx, cy = child.center
    dx, dy = cx - px, cy - py
    if abs(dx) >= abs(dy):
        if dx >= 0:
            start = (parent.x + parent.w, py)
            end = (child.x, cy)
        else:
            start = (parent.x, py)
            end = (child.x + child.w, cy)
        mid = (start[0] + end[0]) / 2
        points = [start, (mid, start[1]), (mid, end[1]), end]
    else:
        if dy >= 0:
            start = (px, parent.y + parent.h)
            end = (cx, child.y)
        else:
            start = (px, parent.y)
            end = (cx, child.y + child.h)
        mid = (start[1] + end[1]) / 2
        points = [start, (start[0], mid), (end[0], mid), end]
    return points


def draw_cardinality(draw, point, value):
    x, y = point
    r = 17
    draw.ellipse((x - r, y - r, x + r, y + r), fill="white", outline="black", width=2)
    bbox = draw.textbbox((0, 0), value, font=F_CARD)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text((x - tw / 2, y - th / 2 - 2), value, fill="black", font=F_CARD)


def draw_relation(draw, entities, parent_key, child_key, cardinality="N", logical=False):
    parent, child = entities[parent_key], entities[child_key]
    points = connection_points(parent, child)
    draw_polyline(draw, points, dashed=logical)
    draw_cardinality(draw, points[0], "1")
    draw_cardinality(draw, points[-1], cardinality)


def draw_entity(draw, e):
    if e.reference:
        dashed_line(draw, [(e.x, e.y), (e.x + e.w, e.y)], width=3, dash=15, gap=9)
        dashed_line(draw, [(e.x + e.w, e.y), (e.x + e.w, e.y + e.h)], width=3, dash=15, gap=9)
        dashed_line(draw, [(e.x + e.w, e.y + e.h), (e.x, e.y + e.h)], width=3, dash=15, gap=9)
        dashed_line(draw, [(e.x, e.y + e.h), (e.x, e.y)], width=3, dash=15, gap=9)
    else:
        draw.rectangle(e.box, fill="white", outline="black", width=4)
    draw.rectangle((e.x, e.y, e.x + e.w, e.y + e.header_h), fill="black")
    title = e.title.upper()
    bbox = draw.textbbox((0, 0), title, font=F_ENTITY)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text((e.x + (e.w - tw) / 2, e.y + (e.header_h - th) / 2 - 3), title, fill="white", font=F_ENTITY)
    y = e.y + e.header_h + 10
    for field in e.fields:
        draw.text((e.x + 16, y), field, fill="black", font=F_FIELD)
        y += e.row_h


def build_panel(origin_x, origin_y, title, specs, relations):
    entities = {
        spec[0]: Entity(spec[0], spec[1], spec[2], origin_x + spec[3], origin_y + spec[4], spec[5], spec[6])
        for spec in specs
    }
    return {"origin": (origin_x, origin_y), "title": title, "entities": entities, "relations": relations}


panels = []

# 1. Identidad y autorizacion
p1_specs = [
    ("org", "organizaciones", ["PK id : uuid", "UK codigo : varchar(32)", "nombre : varchar(150)", "activo : bool"], 1310, 100, 590, False),
    ("areas", "areas", ["PK id : uuid", "FK organizacion_id : uuid", "FK? area_padre_id : uuid", "UK codigo : varchar(32)", "nombre : varchar(120)"], 100, 560, 590, False),
    ("users", "usuarios", ["PK id : uuid", "FK organizacion_id : uuid", "FK? area_id : uuid", "nombre_usuario : varchar(80)", "correo : varchar(254)", "activo : bool"], 980, 560, 650, False),
    ("sessions", "sesiones", ["PK id : uuid", "FK usuario_id : uuid", "UK hash_token : varchar(64)", "expira_en : timestamp", "revocada_en : timestamp?"], 1910, 560, 650, False),
    ("roles", "roles", ["PK id : uuid", "FK organizacion_id : uuid", "codigo : varchar(50)", "nombre : varchar(120)", "activo : bool"], 150, 1190, 590, False),
    ("perms", "permisos", ["PK id : uuid", "UK codigo : varchar(80)", "modulo : varchar(50)", "nombre : varchar(120)", "activo : bool"], 2450, 1190, 590, False),
    ("user_roles", "usuarios_roles", ["PK/FK usuario_id : uuid", "PK/FK rol_id : uuid", "FK? asignado_por_id : uuid", "asignado_en : timestamp", "vigente_hasta : timestamp?"], 730, 1740, 650, False),
    ("role_perms", "roles_permisos", ["PK/FK rol_id : uuid", "PK/FK permiso_id : uuid", "FK? asignado_por_id : uuid", "asignado_en : timestamp"], 1630, 1740, 650, False),
    ("doc_perms", "documentos_roles_permisos", ["PK/FK documento_id : uuid", "PK/FK rol_id : uuid", "PK/FK permiso_id : uuid", "FK asignado_por_id : uuid", "asignado_en : timestamp"], 2520, 1740, 650, False),
]
p1_rel = [
    ("org", "areas", "N", False), ("org", "users", "N", True), ("areas", "users", "N", True),
    ("org", "roles", "N", False), ("users", "sessions", "N", False),
    ("users", "user_roles", "N", False), ("roles", "user_roles", "N", False),
    ("roles", "role_perms", "N", False), ("perms", "role_perms", "N", False),
    ("roles", "doc_perms", "N", True), ("perms", "doc_perms", "N", True),
]
panels.append(build_panel(MARGIN_X, TOP, "1. Identidad, sesiones y autorización", p1_specs, p1_rel))

# 2. Gestion documental
p2x = MARGIN_X + PANEL_W + GAP_X
p2_specs = [
    ("org", "organizaciones [ref]", ["PK id : uuid"], 80, 100, 520, True),
    ("areas", "areas", ["PK id : uuid", "FK organizacion_id : uuid", "codigo : varchar(32)", "nombre : varchar(120)"], 660, 100, 540, False),
    ("types", "tipos_documento", ["PK id", "FK organizacion_id : uuid", "codigo : varchar(32)", "nombre : varchar(100)"], 1260, 100, 560, False),
    ("class", "clasificaciones_documento", ["PK id : uuid", "FK organizacion_id : uuid", "codigo : varchar(32)", "nivel : smallint", "requiere_autorizacion : bool"], 1880, 100, 650, False),
    ("states_doc", "estados_documento", ["PK id : uuid", "UK codigo : varchar(32)", "es_final : bool", "permite_edicion : bool"], 2590, 100, 560, False),
    ("docs", "documentos", ["PK id : uuid", "FK organizacion_id : uuid", "FK area_id : uuid", "FK tipo_documento_id", "FK creado_por_id : uuid", "FK? eliminado_por_id : uuid", "UK codigo : varchar(64)"], 1180, 750, 700, False),
    ("meta", "documentos_metadatos", ["PK id : uuid", "FK documento_id : uuid", "UK clave : varchar(100)", "valor : text"], 180, 1440, 620, False),
    ("versions", "versiones_documento", ["PK id : uuid", "FK documento_id : uuid", "FK estado_version_id", "FK proveedor_almacenamiento_id", "FK creada_por_id : uuid", "numero_mayor/menor : int", "sha256 : varchar(64)"], 1010, 1440, 760, False),
    ("states_ver", "estados_version", ["PK id : smallint", "UK codigo : varchar(32)", "es_final : bool", "permite_edicion : bool"], 1980, 1440, 590, False),
    ("providers", "proveedores_almacenamiento", ["PK id : uuid", "FK organizacion_id : uuid", "codigo : varchar(50)", "tipo : varchar(30)", "contenedor : varchar(255)"], 2630, 1440, 600, False),
]
p2_rel = [
    ("org", "areas", "N", False), ("org", "types", "N", False), ("org", "class", "N", False),
    ("areas", "docs", "N", False), ("types", "docs", "N", False), ("org", "docs", "N", True),
    ("docs", "meta", "N", False), ("docs", "versions", "N", False),
    ("states_ver", "versions", "N", False), ("providers", "versions", "N", False),
]
panels.append(build_panel(p2x, TOP, "2. Documentos, catálogos, metadatos y versiones", p2_specs, p2_rel))

# 3. Revision y consumo
p3y = TOP + PANEL_H + GAP_Y
p3_specs = [
    ("users", "usuarios [ref]", ["PK id : uuid"], 70, 90, 500, True),
    ("docs", "documentos [ref]", ["PK id : uuid"], 690, 90, 520, True),
    ("versions", "versiones_documento [ref]", ["PK id : uuid", "FK documento_id : uuid"], 1350, 90, 650, True),
    ("states_rev", "estados_revision", ["PK id : smallint", "UK codigo : varchar(32)", "es_final : bool"], 2440, 90, 600, False),
    ("requests", "solicitudes_revision", ["PK id : uuid", "FK version_documento_id : uuid", "FK revisor_id : uuid", "FK solicitada_por_id : uuid", "FK estado_revision_id", "solicitada_en : timestamp", "resuelta_en : timestamp?"], 1260, 560, 760, False),
    ("detail", "solicitudes_revision_detalle", ["PK id : uuid", "UK/FK solicitud_revision_id", "fecha_limite : timestamp?", "prioridad : varchar(20)"], 110, 1190, 670, False),
    ("check", "revisiones_checklist", ["PK id : uuid", "FK solicitud_revision_id", "FK? completada_por_id", "orden : int", "completada : bool"], 900, 1190, 650, False),
    ("comments", "revision_comentarios", ["PK id : uuid", "FK solicitud_revision_id", "FK autor_id : uuid", "FK? comentario_padre_id", "FK? resuelto_por_id", "tipo : varchar(20)"], 1710, 1190, 680, False),
    ("access", "documentos_accesos", ["PK id : uuid", "FK documento_id : uuid", "FK version_documento_id", "FK usuario_id : uuid", "tipo : varchar(20)", "registrado_en : timestamp"], 160, 1790, 670, False),
    ("favorites", "documentos_favoritos", ["PK id : uuid", "UK/FK documento_id : uuid", "UK/FK usuario_id : uuid", "creado_en : timestamp"], 990, 1790, 650, False),
    ("notif", "notificaciones", ["PK id : uuid", "FK usuario_id : uuid", "FK? documento_id : uuid", "FK? version_documento_id", "FK? solicitud_revision_id", "tipo : varchar(30)", "leida_en : timestamp?"], 1810, 1790, 730, False),
]
p3_rel = [
    ("versions", "requests", "N", False), ("states_rev", "requests", "N", False), ("users", "requests", "N", False),
    ("requests", "detail", "1", False), ("requests", "check", "N", False), ("requests", "comments", "N", False),
    ("docs", "access", "N", False), ("versions", "access", "N", False), ("users", "access", "N", False),
    ("docs", "favorites", "N", False), ("users", "favorites", "N", False),
    ("users", "notif", "N", False), ("docs", "notif", "N", False), ("versions", "notif", "N", False),
    ("requests", "notif", "N", False),
]
panels.append(build_panel(MARGIN_X, p3y, "3. Revisión, lectura, favoritos y notificaciones", p3_specs, p3_rel))

# 4. Operacion y auditoria
p4_specs = [
    ("org", "organizaciones [ref]", ["PK id : uuid"], 70, 90, 500, True),
    ("users", "usuarios [ref]", ["PK id : uuid"], 700, 90, 500, True),
    ("reports", "reportes_generados_v2", ["PK id : uuid", "FK organizacion_id : uuid", "FK generado_por_id : uuid", "alcance/formato", "clave_almacenamiento : text?", "sha256 : varchar(64)?"], 60, 600, 640, False),
    ("schedules", "programaciones_reportes_v2", ["PK id : uuid", "FK organizacion_id : uuid", "FK creado_por_id : uuid", "frecuencia : varchar(10)", "proxima_ejecucion_en", "activa : bool"], 760, 600, 680, False),
    ("backup_cfg", "configuraciones_respaldo_v2", ["PK id : uuid", "UK/FK organizacion_id", "frecuencia : varchar(20)", "retencion_dias : int", "destino : varchar(20)", "cifrar : bool"], 1500, 600, 680, False),
    ("backups", "respaldos_v2", ["PK id : uuid", "FK organizacion_id : uuid", "FK? creado_por_id : uuid", "destino/estado", "sha256 : varchar(64)", "cifrado : bool"], 2240, 600, 620, False),
    ("system_cfg", "configuraciones_sistema_v2", ["PK id : uuid", "UK/FK organizacion_id", "general/seguridad : jsonb", "smtp/carga : jsonb", "apariencia/notificaciones : jsonb"], 2730, 1200, 500, False),
    ("actions", "acciones_auditoria", ["PK id : uuid", "UK codigo : varchar(50)", "nombre : varchar(120)", "activo : bool"], 120, 1470, 600, False),
    ("resources", "tipos_recurso_auditoria", ["PK id : uuid", "UK codigo : varchar(50)", "nombre : varchar(120)", "activo : bool"], 820, 1470, 650, False),
    ("audit", "bitacora_auditoria", ["PK id", "FK organizacion_id : uuid", "FK? usuario_id : uuid", "FK? sesion_id : uuid", "FK accion_id : uuid", "FK tipo_recurso_id : uuid", "recurso_id : uuid?", "exitoso : bool", "detalles : jsonb"], 500, 1880, 760, False),
]
p4_rel = [
    ("org", "reports", "N", True), ("users", "reports", "N", True),
    ("org", "schedules", "N", True), ("users", "schedules", "N", True),
    ("org", "backup_cfg", "1", True), ("org", "backups", "N", True), ("users", "backups", "N", True),
    ("org", "system_cfg", "1", True), ("org", "audit", "N", True), ("users", "audit", "N", True),
    ("actions", "audit", "N", False), ("resources", "audit", "N", False),
]
panels.append(build_panel(p2x, p3y, "4. Reportes, respaldos, configuración y auditoría", p4_specs, p4_rel))


img = Image.new("1", (W, H), 1)
draw = ImageDraw.Draw(img)

title = "DIAGRAMA ENTIDAD / RELACIÓN — SISTEMA DOCUMENTAL"
tb = draw.textbbox((0, 0), title, font=F_TITLE)
draw.text(((W - (tb[2] - tb[0])) / 2, 52), title, fill="black", font=F_TITLE)
subtitle = "Vista lógica del esquema gestion_documental · claves y atributos principales · blanco y negro"
sb = draw.textbbox((0, 0), subtitle, font=F_SUBTITLE)
draw.text(((W - (sb[2] - sb[0])) / 2, 140), subtitle, fill="black", font=F_SUBTITLE)

for panel in panels:
    ox, oy = panel["origin"]
    draw.rectangle((ox, oy, ox + PANEL_W, oy + PANEL_H), fill="white", outline="black", width=5)
    draw.rectangle((ox, oy, ox + PANEL_W, oy + 70), fill="black")
    draw.text((ox + 24, oy + 14), panel["title"], fill="white", font=F_PANEL)
    for parent, child, cardinality, logical in panel["relations"]:
        draw_relation(draw, panel["entities"], parent, child, cardinality, logical)
    for entity in panel["entities"].values():
        draw_entity(draw, entity)

legend_y = H - 130
draw.line((100, legend_y - 22, W - 100, legend_y - 22), fill="black", width=3)
legend = "PK clave primaria   ·   FK clave foránea   ·   UK clave única   ·   ? opcional/nulo   ·   línea continua: relación declarada   ·   línea discontinua: relación lógica UUID"
draw.text((120, legend_y), legend, fill="black", font=F_SMALL)
note = "Fuente: documentos/models.py y relaciones SQL activas. Se omiten atributos secundarios para conservar legibilidad. Las cajas [ref] representan entidades definidas en otro módulo del mismo diagrama."
draw.text((120, legend_y + 46), note, fill="black", font=F_SMALL)

img.save(OUT, optimize=True)
print(OUT.resolve())
print(f"{W}x{H}")


# Versión unificada: una sola composición continua, sin paneles ni referencias duplicadas.
UNIFIED_OUT = Path(__file__).with_name("erd-sistema-documental-unificado.png")
UW, UH = 7200, 4700

unified_specs = [
    ("org", "organizaciones", ["PK id : uuid", "UK codigo : varchar(32)", "nombre : varchar(150)", "activo : bool"], 3000, 300, 590, False),
    ("areas", "areas", ["PK id : uuid", "FK organizacion_id : uuid", "FK? area_padre_id : uuid", "UK codigo : varchar(32)", "nombre : varchar(120)"], 100, 300, 590, False),
    ("types", "tipos_documento", ["PK id", "FK organizacion_id : uuid", "codigo : varchar(32)", "nombre : varchar(100)"], 750, 300, 590, False),
    ("class", "clasificaciones_documento", ["PK id : uuid", "FK organizacion_id : uuid", "codigo : varchar(32)", "nivel : smallint", "requiere_autorizacion : bool"], 1400, 300, 650, False),
    ("states_doc", "estados_documento", ["PK id : uuid", "UK codigo : varchar(32)", "es_final : bool", "permite_edicion : bool"], 2110, 300, 590, False),
    ("states_ver", "estados_version", ["PK id : smallint", "UK codigo : varchar(32)", "es_final : bool", "permite_edicion : bool"], 3710, 300, 590, False),
    ("states_rev", "estados_revision", ["PK id : smallint", "UK codigo : varchar(32)", "es_final : bool"], 4360, 300, 590, False),
    ("providers", "proveedores_almacenamiento", ["PK id : uuid", "FK organizacion_id : uuid", "codigo : varchar(50)", "tipo : varchar(30)", "contenedor : varchar(255)"], 5010, 300, 620, False),
    ("actions", "acciones_auditoria", ["PK id : uuid", "UK codigo : varchar(50)", "nombre : varchar(120)", "activo : bool"], 5690, 300, 590, False),
    ("resources", "tipos_recurso_auditoria", ["PK id : uuid", "UK codigo : varchar(50)", "nombre : varchar(120)", "activo : bool"], 6340, 300, 650, False),

    ("sessions", "sesiones", ["PK id : uuid", "FK usuario_id : uuid", "UK hash_token : varchar(64)", "expira_en : timestamp", "revocada_en : timestamp?"], 120, 1050, 620, False),
    ("users", "usuarios", ["PK id : uuid", "FK organizacion_id : uuid", "FK? area_id : uuid", "nombre_usuario : varchar(80)", "correo : varchar(254)", "activo : bool"], 820, 1050, 650, False),
    ("roles", "roles", ["PK id : uuid", "FK organizacion_id : uuid", "codigo : varchar(50)", "nombre : varchar(120)", "activo : bool"], 1540, 1050, 590, False),
    ("perms", "permisos", ["PK id : uuid", "UK codigo : varchar(80)", "modulo : varchar(50)", "nombre : varchar(120)", "activo : bool"], 2200, 1050, 590, False),
    ("user_roles", "usuarios_roles", ["PK/FK usuario_id : uuid", "PK/FK rol_id : uuid", "FK? asignado_por_id : uuid", "asignado_en : timestamp", "vigente_hasta : timestamp?"], 980, 1650, 650, False),
    ("role_perms", "roles_permisos", ["PK/FK rol_id : uuid", "PK/FK permiso_id : uuid", "FK? asignado_por_id : uuid", "asignado_en : timestamp"], 1700, 1650, 650, False),

    ("docs", "documentos", ["PK id : uuid", "FK organizacion_id : uuid", "FK area_id : uuid", "FK tipo_documento_id", "FK creado_por_id : uuid", "FK? eliminado_por_id : uuid", "UK codigo : varchar(64)"], 3020, 1050, 700, False),
    ("doc_perms", "documentos_roles_permisos", ["PK/FK documento_id : uuid", "PK/FK rol_id : uuid", "PK/FK permiso_id : uuid", "FK asignado_por_id : uuid", "asignado_en : timestamp"], 2500, 1750, 650, False),
    ("meta", "documentos_metadatos", ["PK id : uuid", "FK documento_id : uuid", "UK clave : varchar(100)", "valor : text"], 3200, 1900, 620, False),
    ("versions", "versiones_documento", ["PK id : uuid", "FK documento_id : uuid", "FK estado_version_id", "FK proveedor_almacenamiento_id", "FK creada_por_id : uuid", "numero_mayor/menor : int", "sha256 : varchar(64)"], 3900, 1100, 760, False),

    ("reports", "reportes_generados_v2", ["PK id : uuid", "FK organizacion_id : uuid", "FK generado_por_id : uuid", "alcance/formato", "clave_almacenamiento : text?", "sha256 : varchar(64)?"], 4900, 1050, 640, False),
    ("schedules", "programaciones_reportes_v2", ["PK id : uuid", "FK organizacion_id : uuid", "FK creado_por_id : uuid", "frecuencia : varchar(10)", "proxima_ejecucion_en", "activa : bool"], 5610, 1050, 680, False),
    ("backup_cfg", "configuraciones_respaldo_v2", ["PK id : uuid", "UK/FK organizacion_id", "frecuencia : varchar(20)", "retencion_dias : int", "destino : varchar(20)", "cifrar : bool"], 4900, 1750, 680, False),
    ("backups", "respaldos_v2", ["PK id : uuid", "FK organizacion_id : uuid", "FK? creado_por_id : uuid", "destino/estado", "sha256 : varchar(64)", "cifrado : bool"], 5650, 1750, 620, False),
    ("system_cfg", "configuraciones_sistema_v2", ["PK id : uuid", "UK/FK organizacion_id", "general/seguridad : jsonb", "smtp/carga : jsonb", "apariencia/notificaciones : jsonb"], 6340, 1750, 700, False),

    ("favorites", "documentos_favoritos", ["PK id : uuid", "UK/FK documento_id : uuid", "UK/FK usuario_id : uuid", "creado_en : timestamp"], 800, 2650, 650, False),
    ("access", "documentos_accesos", ["PK id : uuid", "FK documento_id : uuid", "FK version_documento_id", "FK usuario_id : uuid", "tipo : varchar(20)", "registrado_en : timestamp"], 1530, 3150, 670, False),
    ("requests", "solicitudes_revision", ["PK id : uuid", "FK version_documento_id : uuid", "FK revisor_id : uuid", "FK solicitada_por_id : uuid", "FK estado_revision_id", "solicitada_en : timestamp", "resuelta_en : timestamp?"], 3300, 2650, 760, False),
    ("detail", "solicitudes_revision_detalle", ["PK id : uuid", "UK/FK solicitud_revision_id", "fecha_limite : timestamp?", "prioridad : varchar(20)"], 2350, 3550, 670, False),
    ("check", "revisiones_checklist", ["PK id : uuid", "FK solicitud_revision_id", "FK? completada_por_id", "orden : int", "completada : bool"], 3090, 3550, 650, False),
    ("comments", "revision_comentarios", ["PK id : uuid", "FK solicitud_revision_id", "FK autor_id : uuid", "FK? comentario_padre_id", "FK? resuelto_por_id", "tipo : varchar(20)"], 3810, 3550, 680, False),
    ("notif", "notificaciones", ["PK id : uuid", "FK usuario_id : uuid", "FK? documento_id : uuid", "FK? version_documento_id", "FK? solicitud_revision_id", "tipo : varchar(30)", "leida_en : timestamp?"], 4560, 3550, 730, False),
    ("audit", "bitacora_auditoria", ["PK id", "FK organizacion_id : uuid", "FK? usuario_id : uuid", "FK? sesion_id : uuid", "FK accion_id : uuid", "FK tipo_recurso_id : uuid", "recurso_id : uuid?", "exitoso : bool", "detalles : jsonb"], 5650, 3000, 760, False),
]

unified = {
    spec[0]: Entity(spec[0], spec[1], spec[2], spec[3], spec[4], spec[5], spec[6])
    for spec in unified_specs
}

unified_relations = [
    ("org", "areas", "N", False), ("org", "types", "N", False), ("org", "class", "N", False),
    ("org", "users", "N", True), ("org", "roles", "N", False), ("org", "providers", "N", True),
    ("org", "docs", "N", True), ("org", "reports", "N", True), ("org", "schedules", "N", True),
    ("org", "backup_cfg", "1", True), ("org", "backups", "N", True), ("org", "system_cfg", "1", True),
    ("org", "audit", "N", True),
    ("areas", "users", "N", True), ("areas", "docs", "N", False), ("types", "docs", "N", False),
    ("users", "sessions", "N", False), ("users", "user_roles", "N", False), ("roles", "user_roles", "N", False),
    ("roles", "role_perms", "N", False), ("perms", "role_perms", "N", False),
    ("roles", "doc_perms", "N", True), ("perms", "doc_perms", "N", True), ("docs", "doc_perms", "N", True),
    ("users", "docs", "N", False), ("docs", "meta", "N", False), ("docs", "versions", "N", False),
    ("states_ver", "versions", "N", False), ("providers", "versions", "N", False), ("users", "versions", "N", False),
    ("versions", "requests", "N", False), ("states_rev", "requests", "N", False), ("users", "requests", "N", False),
    ("requests", "detail", "1", False), ("requests", "check", "N", False), ("requests", "comments", "N", False),
    ("docs", "favorites", "N", False), ("users", "favorites", "N", False),
    ("docs", "access", "N", False), ("versions", "access", "N", False), ("users", "access", "N", False),
    ("users", "notif", "N", False), ("docs", "notif", "N", False), ("versions", "notif", "N", False),
    ("requests", "notif", "N", False),
    ("users", "reports", "N", True), ("users", "schedules", "N", True), ("users", "backups", "N", True),
    ("actions", "audit", "N", False), ("resources", "audit", "N", False), ("users", "audit", "N", True),
]

uimg = Image.new("1", (UW, UH), 1)
udraw = ImageDraw.Draw(uimg)
utitle = "DIAGRAMA ENTIDAD / RELACIÓN — SISTEMA DOCUMENTAL"
utb = udraw.textbbox((0, 0), utitle, font=F_TITLE)
udraw.text(((UW - (utb[2] - utb[0])) / 2, 48), utitle, fill="black", font=F_TITLE)
usub = "Esquema unificado gestion_documental · cada entidad aparece una sola vez"
usb = udraw.textbbox((0, 0), usub, font=F_SUBTITLE)
udraw.text(((UW - (usb[2] - usb[0])) / 2, 135), usub, fill="black", font=F_SUBTITLE)

section_labels = [
    (100, 240, "CATÁLOGOS Y ENTIDADES MAESTRAS"),
    (100, 970, "IDENTIDAD Y AUTORIZACIÓN"),
    (2960, 970, "NÚCLEO DOCUMENTAL"),
    (4860, 970, "OPERACIÓN"),
    (760, 2570, "LECTURA Y FAVORITOS"),
    (3260, 2570, "REVISIÓN DOCUMENTAL"),
    (5570, 2920, "AUDITORÍA"),
]
for sx, sy, label in section_labels:
    udraw.text((sx, sy), label, fill="black", font=F_PANEL)
    lb = udraw.textbbox((sx, sy), label, font=F_PANEL)
    udraw.line((sx, lb[3] + 8, min(sx + 700, UW - 100), lb[3] + 8), fill="black", width=3)

for parent, child, cardinality, logical in unified_relations:
    draw_relation(udraw, unified, parent, child, cardinality, logical)
for entity in unified.values():
    draw_entity(udraw, entity)

ulegend_y = UH - 130
udraw.line((100, ulegend_y - 22, UW - 100, ulegend_y - 22), fill="black", width=3)
ulegend = "PK clave primaria   ·   FK clave foránea   ·   UK clave única   ·   ? opcional/nulo   ·   línea continua: relación declarada   ·   línea discontinua: relación lógica UUID"
udraw.text((120, ulegend_y), ulegend, fill="black", font=F_SMALL)
unote = "Fuente: documentos/models.py y relaciones SQL activas. Campos secundarios resumidos para conservar legibilidad."
udraw.text((120, ulegend_y + 46), unote, fill="black", font=F_SMALL)
uimg.save(UNIFIED_OUT, optimize=True)
print(UNIFIED_OUT.resolve())
print(f"{UW}x{UH}")
