from .auth_utils import record_access_denied


class AuditFailureMiddleware:
    """Expose degraded audit persistence without misreporting business success."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if response.status_code in (401, 403):
            data = getattr(response, 'data', None)
            reason = None
            if isinstance(data, dict):
                reason = data.get('code') or data.get('detail')
            record_access_denied(request, str(reason or f'HTTP_{response.status_code}'))
        failures = getattr(request, '_audit_failures', [])
        if failures:
            response['X-Audit-Status'] = 'failed'
            response['X-Audit-Failure-Id'] = failures[0]
            response['X-Audit-Failure-Count'] = str(len(failures))
            response['Cache-Control'] = 'private, no-store'
        return response
