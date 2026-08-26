from rest_framework import serializers


class DocumentCreateSerializer(serializers.Serializer):
    code = serializers.RegexField(r'^[A-Z0-9_-]+$', max_length=64)
    title = serializers.CharField(max_length=200, trim_whitespace=True)
    description = serializers.CharField(required=False, allow_blank=True)
    content = serializers.CharField(required=False, allow_blank=True)
    keywords = serializers.CharField(required=False, allow_blank=True)
    scope = serializers.CharField(required=False, allow_blank=True)
    area_id = serializers.UUIDField(required=False, allow_null=True)
    type_id = serializers.UUIDField()
    classification_id = serializers.UUIDField(required=False, allow_null=True)
    status_id = serializers.UUIDField(required=False)
    status_code = serializers.RegexField(r'^[A-Z0-9_-]+$', required=False, max_length=32)
    responsible_id = serializers.UUIDField(required=False)
    metadata = serializers.JSONField(required=False)

    def validate(self, attrs):
        if attrs.get('status_id') and attrs.get('status_code'):
            raise serializers.ValidationError('Use status_id o status_code, no ambos.')
        if attrs.get('metadata') is not None and not isinstance(attrs['metadata'], dict):
            raise serializers.ValidationError({'metadata': 'Los metadatos deben ser un objeto JSON.'})
        return attrs


class DocumentUpdateSerializer(DocumentCreateSerializer):
    code = serializers.RegexField(r'^[A-Z0-9_-]+$', max_length=64, required=False)
    title = serializers.CharField(max_length=200, trim_whitespace=True, required=False)
    type_id = serializers.UUIDField(required=False)


class DocumentFileSerializer(serializers.Serializer):
    file = serializers.FileField()
