from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Notificacion
from .notifications import serialize_notification
from .permissions import IsAuthenticatedAndPasswordCurrent


class NotificationListView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def get(self, request):
        queryset = Notificacion.objects.filter(usuario_id=request.user.id)
        if request.query_params.get('unread') == 'true':
            queryset = queryset.filter(leida_en__isnull=True)
        notification_type = request.query_params.get('type')
        if notification_type:
            queryset = queryset.filter(tipo=notification_type.upper())
        try:
            limit = min(max(int(request.query_params.get('limit', 25)), 1), 100)
            offset = max(int(request.query_params.get('offset', 0)), 0)
        except (TypeError, ValueError) as error:
            raise serializers.ValidationError({'code': 'INVALID_PAGINATION', 'detail': 'La paginacion no es valida.'}) from error
        total = queryset.count()
        unread_count = Notificacion.objects.filter(usuario_id=request.user.id, leida_en__isnull=True).count()
        notifications = queryset[offset:offset + limit]
        return Response({
            'count': total,
            'unread_count': unread_count,
            'next_offset': offset + limit if offset + limit < total else None,
            'results': [serialize_notification(item, request) for item in notifications],
        })


class NotificationReadView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def post(self, request, notification_id):
        notification = Notificacion.objects.filter(pk=notification_id, usuario_id=request.user.id).first()
        if not notification:
            return Response({'code': 'NOTIFICATION_NOT_FOUND', 'detail': 'La notificacion no existe.'}, status=status.HTTP_404_NOT_FOUND)
        if not notification.leida_en:
            notification.leida_en = timezone.now()
            notification.save(update_fields=['leida_en'])
        return Response({'notification': serialize_notification(notification, request)})


class NotificationReadAllView(APIView):
    permission_classes = [IsAuthenticatedAndPasswordCurrent]

    def post(self, request):
        updated = Notificacion.objects.filter(usuario_id=request.user.id, leida_en__isnull=True).update(leida_en=timezone.now())
        return Response({'updated': updated})
