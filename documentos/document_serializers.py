from rest_framework import serializers


class DocumentCreateSerializer(serializers.Serializer):
    code = serializers.RegexField(r'^[A-Z0-9_-]+$', max_length=64)
    title = serializers.CharField(max_length=200, trim_whitespace=True)
    description = serializers.CharField(required=False, allow_blank=True)
    date = serializers.DateField(required=False, allow_null=True)
    area_id = serializers.UUIDField()
    type_id = serializers.IntegerField(min_value=1)
    metadata = serializers.JSONField(required=False)

    def validate(self, attrs):
        if attrs.get('metadata') is not None and not isinstance(attrs['metadata'], dict):
            raise serializers.ValidationError({'metadata': 'Los metadatos deben ser un objeto JSON.'})
        return attrs


class DocumentUpdateSerializer(DocumentCreateSerializer):
    code = serializers.RegexField(r'^[A-Z0-9_-]+$', max_length=64, required=False)
    title = serializers.CharField(max_length=200, trim_whitespace=True, required=False)
    area_id = serializers.UUIDField(required=False)
    type_id = serializers.IntegerField(min_value=1, required=False)


class DocumentFileSerializer(serializers.Serializer):
    file = serializers.FileField()
