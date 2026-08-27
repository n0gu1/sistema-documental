import base64
import hashlib
import re
import secrets
import uuid
from copy import deepcopy

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings
from django.core.mail import get_connection
from django.core.validators import validate_email
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone

from .backup_service import backup_key
from .models import ConfiguracionSistema


COLOR_PATTERN = re.compile(r'^#[0-9A-Fa-f]{6}$')
ALLOWED_EXTENSIONS = {'.pdf', '.docx', '.xlsx', '.pptx', '.jpg', '.jpeg', '.png'}
DEFAULTS = {
    'general': {
        'organization_name': 'Consultoria Alexandria',
        'timezone': 'America/Bogota',
        'language': 'es-CO',
    },
    'security': {
        'strong_password': True,
        'min_length': 12,
        'complexity': 'high',
        'expiration_days': 90,
        'mfa_admins': True,
        'mfa_users': False,
        'inactivity_minutes': 30,
        'max_session_hours': 8,
        'max_failed_attempts': 5,
        'lock_minutes': 15,
    },
    'smtp': {
        'enabled': False,
        'host': '',
        'port': 587,
        'username': '',
        'security': 'starttls',
        'password_set': False,
    },
    'carga': {
        'max_file_mb': 50,
        'max_request_mb': 250,
        'extensions': sorted(ALLOWED_EXTENSIONS),
    },
    'apariencia': {
        'primary_color': '#1E3A8A',
        'secondary_color': '#0F172A',
        'logo_url': '',
        'favicon_url': '',
    },
    'notificaciones': {
        'in_app_enabled': True,
        'email_enabled': False,
        'digest_frequency': 'immediate',
    },
    'integraciones': {
        'microsoft365': {'enabled': False, 'client_id': '', 'tenant_id': '', 'last_test_at': None, 'status': 'not_configured'},
        'google_workspace': {'enabled': False, 'client_id': '', 'domain': '', 'last_test_at': None, 'status': 'not_configured'},
        'webhook': {'enabled': False, 'url': '', 'last_test_at': None, 'status': 'not_configured'},
    },
}


def merge_defaults(config):
    result = deepcopy(DEFAULTS)
    for section in result:
        result[section].update(deepcopy(getattr(config, section, {}) or {}))
    result['smtp']['password_set'] = bool(result['smtp'].get('password_token')) or bool(result['smtp'].get('password_set'))
    result['smtp'].pop('password_token', None)
    result['integraciones']['storage_s3'] = {
        'enabled': getattr(settings, 'STORAGE_BACKEND', 'filesystem') == 's3',
        'status': 'configured' if getattr(settings, 'STORAGE_BACKEND', 'filesystem') == 's3' else 'not_configured',
        'last_test_at': None,
    }
    result['integraciones']['smtp'] = {
        'enabled': result['smtp']['enabled'],
        'status': 'configured' if result['smtp']['enabled'] and result['smtp']['host'] else 'not_configured',
        'last_test_at': None,
    }
    return result


def get_system_config(organization_id):
    try:
        config = ConfiguracionSistema.objects.filter(organizacion_id=organization_id).first()
    except Exception:
        config = None
    if config:
        return config
    now = timezone.now()
    return ConfiguracionSistema(
        id=uuid.uuid4(),
        organizacion_id=organization_id,
        general=deepcopy(DEFAULTS['general']),
        seguridad=deepcopy(DEFAULTS['security']),
        smtp=deepcopy(DEFAULTS['smtp']),
        carga=deepcopy(DEFAULTS['carga']),
        apariencia=deepcopy(DEFAULTS['apariencia']),
        notificaciones=deepcopy(DEFAULTS['notificaciones']),
        integraciones=deepcopy(DEFAULTS['integraciones']),
        actualizado_en=now,
    )


def serialize_system_config(config):
    values = merge_defaults(config)
    values['uploads'] = values.pop('carga')
    values['appearance'] = values.pop('apariencia')
    values['notifications'] = values.pop('notificaciones')
    values['integrations'] = values.pop('integraciones')
    values['meta'] = {'updated_at': config.actualizado_en, 'persisted': bool(config.pk and not config._state.adding)}
    return values


def security_policy_for(organization_id):
    return merge_defaults(get_system_config(organization_id))['security']


def upload_policy_for(organization_id):
    return merge_defaults(get_system_config(organization_id))['carga']


def encrypt_secret(value):
    nonce = secrets.token_bytes(12)
    encrypted = AESGCM(hashlib.sha256(backup_key() + b'config').digest()).encrypt(nonce, value.encode('utf-8'), None)
    return base64.urlsafe_b64encode(b'CFG1' + nonce + encrypted).decode('ascii')


def decrypt_secret(value):
    payload = base64.urlsafe_b64decode(value.encode('ascii'))
    if not payload.startswith(b'CFG1'):
        raise ValueError('Formato de secreto no valido.')
    nonce = payload[4:16]
    return AESGCM(hashlib.sha256(backup_key() + b'config').digest()).decrypt(nonce, payload[16:], None).decode('utf-8')


def validate_section(section, values):
    values = dict(values or {})
    if section == 'general':
        name = str(values.get('organization_name', '')).strip()
        if not name or len(name) > 150:
            raise ValueError('El nombre de la organizacion debe tener entre 1 y 150 caracteres.')
        values['organization_name'] = name
        values['timezone'] = str(values.get('timezone', 'America/Bogota'))[:80]
        values['language'] = str(values.get('language', 'es-CO'))[:20]
    elif section == 'security':
        values['min_length'] = int(values.get('min_length', 12))
        values['expiration_days'] = int(values.get('expiration_days', 90))
        values['inactivity_minutes'] = int(values.get('inactivity_minutes', 30))
        values['max_session_hours'] = int(values.get('max_session_hours', 8))
        values['max_failed_attempts'] = int(values.get('max_failed_attempts', 5))
        values['lock_minutes'] = int(values.get('lock_minutes', 15))
        if not 8 <= values['min_length'] <= 128 or not 0 <= values['expiration_days'] <= 365 or not 5 <= values['inactivity_minutes'] <= 1440 or not 1 <= values['max_session_hours'] <= 720 or not 1 <= values['max_failed_attempts'] <= 20 or not 1 <= values['lock_minutes'] <= 1440:
            raise ValueError('Los valores de seguridad estan fuera de rango.')
        if values.get('complexity', 'high') not in {'basic', 'medium', 'high'}:
            raise ValueError('La complejidad de contraseña no es valida.')
        for key in ('strong_password', 'mfa_admins', 'mfa_users'):
            values[key] = bool(values.get(key, DEFAULTS['security'][key]))
    elif section == 'smtp':
        values['enabled'] = bool(values.get('enabled', False))
        values['host'] = str(values.get('host', '')).strip()[:255]
        values['port'] = int(values.get('port', 587))
        values['username'] = str(values.get('username', '')).strip()[:254]
        values['security'] = str(values.get('security', 'starttls')).lower()
        if not 1 <= values['port'] <= 65535 or values['security'] not in {'starttls', 'ssl', 'none'}:
            raise ValueError('La configuracion SMTP no es valida.')
        password = values.pop('password', None)
        if password:
            values['password_token'] = encrypt_secret(str(password))
            values['password_set'] = True
        values['password_set'] = bool(values.get('password_token') or values.get('password_set'))
    elif section == 'uploads':
        values['max_file_mb'] = int(values.get('max_file_mb', 50))
        values['max_request_mb'] = int(values.get('max_request_mb', 250))
        extensions = values.get('extensions', sorted(ALLOWED_EXTENSIONS))
        if isinstance(extensions, str):
            extensions = extensions.split(',')
        values['extensions'] = sorted({item.strip().lower() if item.strip().startswith('.') else f'.{item.strip().lower()}' for item in extensions if item.strip()})
        if not values['extensions'] or not set(values['extensions']).issubset(ALLOWED_EXTENSIONS) or not 1 <= values['max_file_mb'] <= values['max_request_mb'] <= 2048:
            raise ValueError('Los limites o tipos de archivo no son validos.')
    elif section == 'appearance':
        for key in ('primary_color', 'secondary_color'):
            if not COLOR_PATTERN.fullmatch(str(values.get(key, DEFAULTS['apariencia'][key]))):
                raise ValueError('Los colores deben usar formato hexadecimal.')
        values['logo_url'] = str(values.get('logo_url', ''))[:500]
        values['favicon_url'] = str(values.get('favicon_url', ''))[:500]
    elif section == 'notifications':
        values['in_app_enabled'] = bool(values.get('in_app_enabled', True))
        values['email_enabled'] = bool(values.get('email_enabled', False))
        values['digest_frequency'] = str(values.get('digest_frequency', 'immediate')).lower()
        if values['digest_frequency'] not in {'immediate', 'daily', 'weekly'}:
            raise ValueError('La frecuencia de notificaciones no es valida.')
    elif section == 'integrations':
        for provider, provider_values in values.items():
            if provider not in {'microsoft365', 'google_workspace', 'webhook', 'storage_s3', 'smtp'}:
                raise ValueError('La integracion no es valida.')
            provider_values = dict(provider_values or {})
            provider_values['enabled'] = bool(provider_values.get('enabled', False))
            if provider == 'webhook' and provider_values.get('url') and not str(provider_values['url']).startswith('https://'):
                raise ValueError('El webhook debe usar HTTPS.')
            values[provider] = provider_values
    return values


def update_system_config(organization_id, sections):
    config = ConfiguracionSistema.objects.filter(organizacion_id=organization_id).first()
    now = timezone.now()
    if not config:
        config = ConfiguracionSistema(
            id=uuid.uuid4(),
            organizacion_id=organization_id,
            general=deepcopy(DEFAULTS['general']),
            seguridad=deepcopy(DEFAULTS['security']),
            smtp=deepcopy(DEFAULTS['smtp']),
            carga=deepcopy(DEFAULTS['carga']),
            apariencia=deepcopy(DEFAULTS['apariencia']),
            notificaciones=deepcopy(DEFAULTS['notificaciones']),
            integraciones=deepcopy(DEFAULTS['integraciones']),
            actualizado_en=now,
        )
    mapping = {'general': 'general', 'security': 'seguridad', 'smtp': 'smtp', 'uploads': 'carga', 'appearance': 'apariencia', 'notifications': 'notificaciones', 'integrations': 'integraciones'}
    for section, field in mapping.items():
        if section in sections:
            current = getattr(config, field, {}) or {}
            incoming = validate_section(section, sections[section])
            if section == 'smtp' and not incoming.get('password') and current.get('password_token'):
                incoming['password_token'] = current['password_token']
                incoming['password_set'] = True
            current.update(incoming)
            setattr(config, field, current)
    config.actualizado_en = now
    config.save()
    return config


def smtp_connection_for(organization_id, fail_silently=False):
    config = get_system_config(organization_id)
    smtp = merge_defaults(config)['smtp']
    raw_config = getattr(config, 'smtp', {}) or {}
    if not smtp.get('enabled') or not smtp.get('host') or not raw_config.get('password_token'):
        return None
    try:
        password = decrypt_secret(raw_config['password_token'])
    except Exception:
        return None
    return get_connection(
        backend='django.core.mail.backends.smtp.EmailBackend',
        fail_silently=fail_silently,
        host=smtp['host'],
        port=smtp['port'],
        username=smtp['username'],
        password=password,
        use_tls=smtp['security'] == 'starttls',
        use_ssl=smtp['security'] == 'ssl',
    )
