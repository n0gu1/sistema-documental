from django.db import transaction
from django.utils import timezone

from .models import SesionDocumental, UsuarioDocumental


def revoke_user_sessions(user_id, motivo, now=None):
    """Mecanismo único de revocación usado por todas las rutas de deshabilitación/bloqueo."""
    now = now or timezone.now()
    return SesionDocumental.objects.filter(usuario_id=user_id, revocada_en__isnull=True).update(
        revocada_en=now,
        motivo_revocacion=motivo,
    )


def update_user_state(user, updates):
    """Serializa con login y revoca sesiones en la misma transacción al desactivar."""
    updates = dict(updates)
    with transaction.atomic():
        UsuarioDocumental.objects.select_for_update().get(pk=user.pk)
        now = timezone.now()
        updates['actualizado_en'] = now
        if 'activo' in updates:
            updates['deshabilitado_en'] = None if updates['activo'] else now
        UsuarioDocumental.objects.filter(pk=user.pk).update(**updates)
        if updates.get('activo') is False:
            revoke_user_sessions(user.pk, 'Cuenta deshabilitada por un administrador', now)
    for field, value in updates.items():
        setattr(user, field, value)
