import hashlib
from pathlib import Path

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
