from rest_framework.decorators import api_view
from rest_framework.response import Response


@api_view(['GET'])
def hola_mundo(request):
    return Response({
        'mensaje': '¡Hola Mundo desde Sistema Documental!',
        'estado': 'funcionando'
    })
