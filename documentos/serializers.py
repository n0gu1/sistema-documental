from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers


class LoginSerializer(serializers.Serializer):
    identity = serializers.CharField(max_length=254, trim_whitespace=True)
    password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)
    remember = serializers.BooleanField(default=False)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)
    new_password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)
    confirm_password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)

    def validate(self, attrs):
        if attrs['new_password'] != attrs['confirm_password']:
            raise serializers.ValidationError({'confirm_password': 'Las contraseñas no coinciden.'})
        if attrs['current_password'] == attrs['new_password']:
            raise serializers.ValidationError({'new_password': 'La nueva contraseña debe ser diferente.'})

        request = self.context.get('request')
        user = getattr(request, 'user', None)
        password_user = None
        if user and user.is_authenticated:
            password_user = get_user_model()(
                username=user.nombre_usuario,
                email=user.correo,
                first_name=user.nombres,
                last_name=user.apellidos,
            )

        try:
            validate_password(attrs['new_password'], user=password_user)
        except DjangoValidationError as error:
            raise serializers.ValidationError({'new_password': list(error.messages)}) from error

        return attrs
