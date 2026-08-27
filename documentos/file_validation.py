import hashlib
from pathlib import Path
from zipfile import BadZipFile, ZipFile, is_zipfile

from django.conf import settings
from rest_framework.exceptions import ValidationError


MIME_BY_EXTENSION = {
    '.pdf': {'application/pdf'},
    '.docx': {'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},
    '.xlsx': {'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},
    '.pptx': {'application/vnd.openxmlformats-officedocument.presentationml.presentation'},
    '.jpg': {'image/jpeg'},
    '.jpeg': {'image/jpeg'},
    '.png': {'image/png'},
}

OOXML_EXTENSIONS = {'.docx', '.xlsx', '.pptx'}
MAX_ARCHIVE_ENTRIES = 2000
MAX_ARCHIVE_UNCOMPRESSED_MB = 200
BLOCKED_ARCHIVE_SUFFIXES = {
    '.bat', '.cmd', '.com', '.dll', '.exe', '.js', '.msi', '.ps1', '.scr', '.vbe', '.vbs',
}


def _content_matches(extension, content):
    signatures = {
        '.pdf': content.startswith(b'%PDF-'),
        '.docx': content.startswith(b'PK'),
        '.xlsx': content.startswith(b'PK'),
        '.pptx': content.startswith(b'PK'),
        '.jpg': content.startswith(b'\xff\xd8\xff'),
        '.jpeg': content.startswith(b'\xff\xd8\xff'),
        '.png': content.startswith(b'\x89PNG\r\n\x1a\n'),
    }
    return signatures.get(extension, False)


def _validate_archive_safety(extension, uploaded_file):
    if extension not in OOXML_EXTENSIONS:
        return
    position = uploaded_file.tell()
    try:
        uploaded_file.seek(0)
        if not is_zipfile(uploaded_file):
            raise ValidationError({'file': 'El archivo OOXML no es un contenedor ZIP valido.'})
        uploaded_file.seek(0)
        with ZipFile(uploaded_file) as archive:
            members = archive.infolist()
            if len(members) > MAX_ARCHIVE_ENTRIES:
                raise ValidationError({'file': 'El archivo contiene demasiados elementos internos.'})
            uncompressed_size = 0
            for member in members:
                parts = Path(member.filename.replace('\\', '/')).parts
                if Path(member.filename).is_absolute() or '..' in parts:
                    raise ValidationError({'file': 'El archivo contiene una ruta interna no segura.'})
                if member.filename.lower().endswith('vbaproject.bin'):
                    raise ValidationError({'file': 'Los archivos con macros no estan permitidos.'})
                if Path(member.filename).suffix.lower() in BLOCKED_ARCHIVE_SUFFIXES:
                    raise ValidationError({'file': 'El archivo contiene un recurso ejecutable no permitido.'})
                uncompressed_size += member.file_size
                if uncompressed_size > MAX_ARCHIVE_UNCOMPRESSED_MB * 1024 * 1024:
                    raise ValidationError({'file': 'El contenido descomprimido supera el limite de seguridad.'})
    except BadZipFile as error:
        raise ValidationError({'file': 'El archivo OOXML esta danado o no es valido.'}) from error
    finally:
        uploaded_file.seek(position)


def validate_uploaded_file(uploaded_file, organization_id=None):
    name = Path(uploaded_file.name or '').name
    extension = Path(name).suffix.lower()
    policy = None
    if organization_id:
        from .config_service import upload_policy_for

        policy = upload_policy_for(organization_id)
    allowed_extensions = set(policy['extensions'] if policy else {
        item.lower() if item.startswith('.') else f'.{item.lower()}'
        for item in settings.ALLOWED_UPLOAD_EXTENSIONS
    })
    if extension not in allowed_extensions:
        raise ValidationError({'file': f'Extension no permitida: {extension or "sin extension"}.'})

    max_size_mb = policy['max_file_mb'] if policy else settings.MAX_UPLOAD_SIZE_MB
    max_size = max_size_mb * 1024 * 1024
    if uploaded_file.size > max_size:
        raise ValidationError({'file': f'El archivo supera el limite de {max_size_mb} MB.'})

    mime_type = (uploaded_file.content_type or '').lower()
    allowed_mimes = MIME_BY_EXTENSION.get(extension, set())
    if mime_type not in allowed_mimes:
        raise ValidationError({'file': 'El tipo MIME no coincide con la extension del archivo.'})

    position = uploaded_file.tell()
    header = uploaded_file.read(16)
    uploaded_file.seek(position)
    if not _content_matches(extension, header):
        raise ValidationError({'file': 'El contenido no coincide con el tipo de archivo declarado.'})

    _validate_archive_safety(extension, uploaded_file)

    digest = hashlib.sha256()
    for chunk in uploaded_file.chunks():
        digest.update(chunk)
    uploaded_file.seek(position)
    return {
        'name': name,
        'mime_type': mime_type,
        'size': uploaded_file.size,
        'sha256': digest.hexdigest(),
    }
