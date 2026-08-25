from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated


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
