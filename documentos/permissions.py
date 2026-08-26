from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated

from .auth_utils import user_has_permission


class IsAuthenticatedAndPasswordCurrent(IsAuthenticated):
    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        if request.user.debe_cambiar_contrasena:
            raise PermissionDenied(
                {
                    'code': 'PASSWORD_CHANGE_REQUIRED',
                    'detail': 'Debe cambiar la contraseña antes de continuar.',
                },
            )
        return True


class HasDocumentalPermission(IsAuthenticatedAndPasswordCurrent):
    permission_code = None

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        permission_code = getattr(view, 'permission_code', self.permission_code)
        if not permission_code or not user_has_permission(request.user, permission_code):
            raise PermissionDenied(
                {
                    'code': 'INSUFFICIENT_PERMISSIONS',
                    'detail': 'No tiene permisos para realizar esta operacion.',
                },
            )
        return True
