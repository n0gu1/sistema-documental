"""GET de ambos scopes con usuarios y documentos existentes en Neon."""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
import django
django.setup()
from django.test import override_settings
from rest_framework.test import APIClient
from documentos.models import UsuarioDocumental

results = []
with override_settings(ALLOWED_HOSTS=['testserver'], SECURE_SSL_REDIRECT=False):
    for scope, email in [('executive', 'prueba.admin@test.local'), ('editor', 'prueba.editor@test.local')]:
        user = UsuarioDocumental.objects.get(correo=email)
        client = APIClient()
        client.force_authenticate(user=user)
        path = f'/api/reports/?scope={scope}'
        response = client.get(path)
        assert response.status_code == 200, (scope, response.status_code)
        data = response.json()
        assert set(data) == {'scope', 'filters', 'summary', 'options', 'rows', 'history'}
        assert data['scope'] == scope and data['filters'] == {}
        assert isinstance(data['summary'], dict) and isinstance(data['options'], dict)
        assert isinstance(data['rows'], list) and isinstance(data['history'], list)
        assert data['rows'], f'{scope}: se requieren datos existentes, no respuesta vacía'
        assert data['summary']['total'] == len(data['rows'])
        row_keys = {'id', 'code', 'title', 'area_id', 'area', 'type_id', 'type',
                    'responsible_id', 'responsible', 'status_code', 'status', 'version', 'updated_at'}
        for row in data['rows']:
            assert set(row) == row_keys
            if scope == 'editor':
                assert row['responsible_id'] == str(user.id)
        rows = data['rows']
        for previous, current in zip(rows, rows[1:]):
            assert previous['updated_at'] >= current['updated_at']
            if previous['updated_at'] == current['updated_at']:
                assert previous['code'] <= current['code']
        results.append({'request': 'GET ' + path, 'user': email, 'status': response.status_code,
                        'keys': sorted(data), 'row_keys': sorted(row_keys),
                        'row_count': len(rows), 'summary_total': data['summary']['total'],
                        'history_count': len(data['history']), 'ordering_verified': True})

result = {'environment': 'backend local conectado a Neon; identidades existentes mediante force_authenticate',
          'results': results}
(ROOT / 'docs/resultado_reportes_58_59.json').write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False))
