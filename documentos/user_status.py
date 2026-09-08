from django.db import transaction
from django.utils import timezone

from .models import SesionDocumental, UsuarioDocumental


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
            SesionDocumental.objects.filter(usuario_id=user.pk, revocada_en__isnull=True).update(
                revocada_en=now,
                motivo_revocacion='Cuenta deshabilitada por un administrador',
            )
    for field, value in updates.items():
        setattr(user, field, value)
