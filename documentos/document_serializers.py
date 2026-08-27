from rest_framework import serializers

from .security_utils import sanitize_text


class DocumentCreateSerializer(serializers.Serializer):
    code = serializers.RegexField(r'^[A-Z0-9_-]+$', max_length=64)
    title = serializers.CharField(max_length=200, trim_whitespace=True)
    description = serializers.CharField(required=False, allow_blank=True)
    date = serializers.DateField(required=False, allow_null=True)
    area_id = serializers.UUIDField()
    type_id = serializers.IntegerField(min_value=1)
    metadata = serializers.JSONField(required=False)
    file_comment = serializers.CharField(required=False, allow_blank=True, max_length=1000)

    def validate(self, attrs):
        if attrs.get('metadata') is not None and not isinstance(attrs['metadata'], dict):
            raise serializers.ValidationError({'metadata': 'Los metadatos deben ser un objeto JSON.'})
        return attrs

    def validate_title(self, value):
        return sanitize_text(value)

    def validate_description(self, value):
        return sanitize_text(value)

    def validate_file_comment(self, value):
        return sanitize_text(value)


class DocumentUpdateSerializer(DocumentCreateSerializer):
    code = serializers.RegexField(r'^[A-Z0-9_-]+$', max_length=64, required=False)
    title = serializers.CharField(max_length=200, trim_whitespace=True, required=False)
    area_id = serializers.UUIDField(required=False)
    type_id = serializers.IntegerField(min_value=1, required=False)


class DocumentFileSerializer(serializers.Serializer):
    file = serializers.FileField()
    comment = serializers.CharField(required=False, allow_blank=True, max_length=1000)
