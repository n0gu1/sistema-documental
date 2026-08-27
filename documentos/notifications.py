import logging

from django.conf import settings
from django.core.mail import send_mail
from django.urls import reverse
from django.utils import timezone

from .models import Notificacion
from .config_service import get_system_config, merge_defaults, smtp_connection_for


logger = logging.getLogger(__name__)


def serialize_notification(notification, request=None):
    result = {
        'id': str(notification.id),
        'type': notification.tipo,
        'title': notification.titulo,
        'message': notification.mensaje,
        'read_at': notification.leida_en,
        'email_sent_at': notification.correo_enviado_en,
        'created_at': notification.creado_en,
        'document_id': str(notification.documento_id) if notification.documento_id else None,
        'version_id': str(notification.version_documento_id) if notification.version_documento_id else None,
        'review_id': str(notification.solicitud_revision_id) if notification.solicitud_revision_id else None,
    }
    if request:
        result['read_url'] = request.build_absolute_uri(
            reverse('notification-read', args=[notification.id]),
        )
    return result


def create_notification(
    *,
    user,
    notification_type,
    title,
    message,
    document=None,
    version=None,
    review=None,
):
    notification = Notificacion.objects.create(
        usuario=user,
        tipo=notification_type,
        titulo=title,
        mensaje=message,
        documento=document,
        version_documento=version,
        solicitud_revision=review,
    )
    notification_config = merge_defaults(get_system_config(getattr(user, 'organizacion_id', None)))['notificaciones']
    email_enabled = notification_config['email_enabled'] or settings.NOTIFICATIONS_EMAIL_ENABLED
    if email_enabled and user.correo:
        try:
            connection = smtp_connection_for(getattr(user, 'organizacion_id', None))
            mail_options = {'fail_silently': False}
            if connection:
                mail_options['connection'] = connection
            send_mail(title, message, settings.DEFAULT_FROM_EMAIL, [user.correo], **mail_options)
        except Exception as error:
            notification.error_correo = str(error)[:2000]
            notification.save(update_fields=['error_correo'])
            logger.exception('No se pudo enviar la notificacion %s por correo', notification.id)
        else:
            notification.correo_enviado_en = timezone.now()
            notification.save(update_fields=['correo_enviado_en'])
    return notification


def notify_review_assignment(review, actor_id=None):
    if review.revisor_id == actor_id:
        return None
    document = review.version_documento.documento
    version = review.version_documento
    return create_notification(
        user=review.revisor,
        notification_type='REVISION_ASIGNADA',
        title='Nueva revision asignada',
        message=f'Revisa el documento {document.codigo} - {document.nombre}.',
        document=document,
        version=version,
        review=review,
    )


def notify_review_comment(review, author_id):
    recipients = []
    for user in (review.revisor, review.solicitada_por):
        if user.id != author_id and user.id not in {item.id for item in recipients}:
            recipients.append(user)
    document = review.version_documento.documento
    version = review.version_documento
    notifications = []
    for user in recipients:
        notifications.append(create_notification(
            user=user,
            notification_type='COMENTARIO_REVISION',
            title='Nuevo comentario de revision',
            message=f'Hay un nuevo comentario en la revision del documento {document.codigo}.',
            document=document,
            version=version,
            review=review,
        ))
    return notifications


def notify_review_decision(review, decision_type):
    notification_data = {
        'approve': ('APROBACION_REVISION', 'Revision aprobada', 'La revision del documento {code} fue aprobada.'),
        'return': ('DEVOLUCION_REVISION', 'Revision devuelta', 'La revision del documento {code} fue devuelta con observaciones.'),
        'reject': ('RECHAZO_REVISION', 'Revision rechazada', 'La revision del documento {code} fue rechazada.'),
    }
    notification_type, title, template = notification_data[decision_type]
    document = review.version_documento.documento
    if review.solicitada_por_id == review.revisor_id:
        return None
    return create_notification(
        user=review.solicitada_por,
        notification_type=notification_type,
        title=title,
        message=template.format(code=document.codigo),
        document=document,
        version=review.version_documento,
        review=review,
    )


def notify_document_publication(document, version, actor_id=None):
    if document.creado_por_id == actor_id:
        return None
    return create_notification(
        user=document.creado_por,
        notification_type='PUBLICACION_DOCUMENTO',
        title='Documento publicado',
        message=f'La version {version.numero_mayor}.{version.numero_menor} de {document.codigo} fue publicada.',
        document=document,
        version=version,
    )
