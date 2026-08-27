"""
Django settings for backend project.
"""

import os
import secrets
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

def env_bool(name, default=False):
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {'1', 'true', 'yes', 'on'}


def env_list(name, default=None):
    value = os.environ.get(name)
    if value is None:
        return list(default or [])
    return [item.strip() for item in value.split(',') if item.strip()]


# Production must provide an explicit secret; development receives an ephemeral one.
ENVIRONMENT = os.environ.get('ENVIRONMENT', 'development').strip().lower()
DEBUG = env_bool('DEBUG', ENVIRONMENT != 'production')
SECRET_KEY = os.environ.get('SECRET_KEY')
if not SECRET_KEY and not DEBUG:
    raise ImproperlyConfigured('SECRET_KEY es obligatoria fuera de desarrollo.')
SECRET_KEY = SECRET_KEY or secrets.token_urlsafe(50)

render_hostname = os.environ.get('RENDER_EXTERNAL_HOSTNAME', '').strip()
default_allowed_hosts = ['localhost', '127.0.0.1']
if render_hostname:
    default_allowed_hosts.append(render_hostname)
ALLOWED_HOSTS = env_list('ALLOWED_HOSTS', default_allowed_hosts)
if render_hostname and render_hostname not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(render_hostname)
if not DEBUG and not ALLOWED_HOSTS:
    raise ImproperlyConfigured('ALLOWED_HOSTS debe definir al menos un host en produccion.')

# Apps
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'documentos',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

# CORS and CSRF
default_origins = ['http://localhost:5173'] if DEBUG else []
if render_hostname:
    default_origins.append(f'https://{render_hostname}')
CORS_ALLOWED_ORIGINS = env_list('CORS_ALLOWED_ORIGINS', default_origins)
CORS_ALLOW_CREDENTIALS = env_bool('CORS_ALLOW_CREDENTIALS', True)
CSRF_TRUSTED_ORIGINS = env_list('CSRF_TRUSTED_ORIGINS', default_origins)
if render_hostname:
    render_origin = f'https://{render_hostname}'
    if render_origin not in CORS_ALLOWED_ORIGINS:
        CORS_ALLOWED_ORIGINS.append(render_origin)
    if render_origin not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(render_origin)
if CORS_ALLOW_CREDENTIALS and '*' in CORS_ALLOWED_ORIGINS:
    raise ImproperlyConfigured('CORS_ALLOWED_ORIGINS no puede usar * con credenciales.')

# i18n
LANGUAGE_CODE = 'es-es'
TIME_ZONE = 'America/Bogota'
USE_I18N = True
USE_TZ = True

# Notifications are persisted internally; SMTP delivery is opt-in in each environment.
NOTIFICATIONS_EMAIL_ENABLED = env_bool('NOTIFICATIONS_EMAIL_ENABLED', False)
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = os.environ.get('EMAIL_HOST', '')
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', '587'))
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')
EMAIL_USE_TLS = env_bool('EMAIL_USE_TLS', True)
EMAIL_USE_SSL = env_bool('EMAIL_USE_SSL', False)
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'notificaciones@sistema-documental.local')

# URLs
ROOT_URLCONF = 'backend.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'frontend' / 'dist'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'backend.wsgi.application'

# Database
database_url = os.environ.get('DATABASE_URL', '').strip()
if database_url:
    parsed_database_url = urlparse(database_url)
    if parsed_database_url.scheme not in {'postgres', 'postgresql'}:
        raise ImproperlyConfigured('DATABASE_URL debe usar el esquema postgres o postgresql.')

    database_options = {
        key: values[-1]
        for key, values in parse_qs(parsed_database_url.query).items()
    }
    if not DEBUG and 'sslmode' not in database_options:
        database_options['sslmode'] = 'require'

    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': unquote(parsed_database_url.path.lstrip('/')),
            'USER': unquote(parsed_database_url.username or ''),
            'PASSWORD': unquote(parsed_database_url.password or ''),
            'HOST': parsed_database_url.hostname,
            'PORT': parsed_database_url.port or '5432',
            'OPTIONS': database_options,
            'CONN_MAX_AGE': int(os.environ.get('DB_CONN_MAX_AGE', '600')),
            'CONN_HEALTH_CHECKS': True,
        }
    }
else:
    database_variables = ['DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_HOST']
    missing_database_variables = [name for name in database_variables if not os.environ.get(name)]
    if not DEBUG and missing_database_variables:
        missing = ', '.join(missing_database_variables)
        raise ImproperlyConfigured(f'Faltan variables de base de datos: {missing}.')

    database_options = {}
    sslmode = os.environ.get('DB_SSLMODE')
    if sslmode:
        database_options['sslmode'] = sslmode
    elif not DEBUG:
        database_options['sslmode'] = 'require'

    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.environ.get('DB_NAME', 'sistema_documental'),
            'USER': os.environ.get('DB_USER', 'postgres'),
            'PASSWORD': os.environ.get('DB_PASSWORD', ''),
            'HOST': os.environ.get('DB_HOST', 'localhost'),
            'PORT': os.environ.get('DB_PORT', '5432'),
            'OPTIONS': database_options,
            'CONN_MAX_AGE': int(os.environ.get('DB_CONN_MAX_AGE', '600')),
            'CONN_HEALTH_CHECKS': True,
        }
    }

# Document management authentication
AUTH_COOKIE_NAME = 'sd_session'
AUTH_COOKIE_SECURE = os.environ.get('AUTH_COOKIE_SECURE', str(not DEBUG)).lower() == 'true'
AUTH_SESSION_HOURS = int(os.environ.get('AUTH_SESSION_HOURS', '12'))
AUTH_REMEMBER_DAYS = int(os.environ.get('AUTH_REMEMBER_DAYS', '30'))
AUTH_MAX_FAILED_ATTEMPTS = int(os.environ.get('AUTH_MAX_FAILED_ATTEMPTS', '5'))
AUTH_LOCK_MINUTES = int(os.environ.get('AUTH_LOCK_MINUTES', '15'))

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'documentos.authentication.CookieTokenAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'documentos.permissions.IsAuthenticatedAndPasswordCurrent',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'login': '10/min',
        'change_password': '5/hour',
    },
}

# Uploaded files
MAX_UPLOAD_SIZE_MB = int(os.environ.get('MAX_UPLOAD_SIZE_MB', '50'))
MAX_REQUEST_SIZE_MB = int(os.environ.get('MAX_REQUEST_SIZE_MB', '250'))
FILE_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_SIZE_MB * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = MAX_REQUEST_SIZE_MB * 1024 * 1024
ALLOWED_UPLOAD_EXTENSIONS = env_list(
    'ALLOWED_UPLOAD_EXTENSIONS',
    ['.pdf', '.docx', '.xlsx', '.pptx', '.jpg', '.jpeg', '.png'],
)

MEDIA_URL = '/media/'
MEDIA_ROOT = Path(os.environ.get('MEDIA_ROOT', BASE_DIR / 'media'))
storage_backend = os.environ.get('STORAGE_BACKEND', 'filesystem').strip().lower()
STORAGE_BACKEND = storage_backend
BACKUP_ENCRYPTION_KEY = os.environ.get('BACKUP_ENCRYPTION_KEY', '').strip()
if storage_backend == 's3':
    required_storage_variables = ['AWS_STORAGE_BUCKET_NAME', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']
    missing_storage_variables = [name for name in required_storage_variables if not os.environ.get(name)]
    if missing_storage_variables:
        missing = ', '.join(missing_storage_variables)
        raise ImproperlyConfigured(f'Faltan variables de almacenamiento S3: {missing}.')

    AWS_STORAGE_BUCKET_NAME = os.environ['AWS_STORAGE_BUCKET_NAME']
    AWS_ACCESS_KEY_ID = os.environ['AWS_ACCESS_KEY_ID']
    AWS_SECRET_ACCESS_KEY = os.environ['AWS_SECRET_ACCESS_KEY']
    AWS_S3_REGION_NAME = os.environ.get('AWS_S3_REGION_NAME', 'us-east-1')
    AWS_S3_ENDPOINT_URL = os.environ.get('AWS_S3_ENDPOINT_URL') or None
    AWS_DEFAULT_ACL = None
    AWS_QUERYSTRING_AUTH = True
    AWS_S3_FILE_OVERWRITE = False
    AWS_LOCATION = os.environ.get('AWS_LOCATION', 'documentos')
    STORAGES = {
        'default': {'BACKEND': 'storages.backends.s3.S3Storage'},
        'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'},
    }
elif storage_backend == 'filesystem':
    if not DEBUG:
        raise ImproperlyConfigured(
            'El almacenamiento filesystem no es persistente en produccion; configure STORAGE_BACKEND=s3.'
        )
    STORAGES = {
        'default': {
            'BACKEND': 'django.core.files.storage.FileSystemStorage',
            'OPTIONS': {'location': MEDIA_ROOT, 'base_url': MEDIA_URL},
        },
        'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'},
    }
else:
    raise ImproperlyConfigured('STORAGE_BACKEND debe ser filesystem o s3.')

CSRF_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SAMESITE = 'Lax'
SESSION_COOKIE_SECURE = not DEBUG
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_SSL_REDIRECT = not DEBUG
SECURE_HSTS_SECONDS = 31536000 if not DEBUG else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = not DEBUG
SECURE_HSTS_PRELOAD = not DEBUG

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# Static files
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_DIRS = [BASE_DIR / 'frontend' / 'dist']

# Default primary key
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
