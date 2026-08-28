from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .config_service import security_policy_for
from .security_utils import sanitize_text


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

        policy = security_policy_for(getattr(user, 'organizacion_id', None))
        new_password = attrs['new_password']
        if len(new_password) < policy['min_length']:
            raise serializers.ValidationError({'new_password': [f'La contraseña debe tener al menos {policy["min_length"]} caracteres.']})
        if policy['strong_password'] and policy['complexity'] == 'high' and not all([
            any(character.isupper() for character in new_password),
            any(character.islower() for character in new_password),
            any(character.isdigit() for character in new_password),
            any(not character.isalnum() for character in new_password),
        ]):
            raise serializers.ValidationError({'new_password': ['La contraseña debe combinar mayúsculas, minúsculas, números y símbolos.']})

        return attrs


class UserCreateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=80, trim_whitespace=True)
    email = serializers.EmailField(max_length=254)
    first_name = serializers.CharField(max_length=120, trim_whitespace=True)
    last_name = serializers.CharField(max_length=120, trim_whitespace=True)
    organization_id = serializers.UUIDField()
    area_id = serializers.UUIDField(required=False, allow_null=True)
    temporary_password = serializers.CharField(max_length=128, write_only=True)
    role_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        allow_empty=True,
    )

    def validate_temporary_password(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as error:
            raise serializers.ValidationError(list(error.messages)) from error
        return value

    def validate_username(self, value):
        return sanitize_text(value)

    def validate_first_name(self, value):
        return sanitize_text(value)

    def validate_last_name(self, value):
        return sanitize_text(value)


class UserUpdateSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254, required=False)
    first_name = serializers.CharField(max_length=120, trim_whitespace=True, required=False)
    last_name = serializers.CharField(max_length=120, trim_whitespace=True, required=False)
    area_id = serializers.UUIDField(required=False, allow_null=True)
    active = serializers.BooleanField(required=False)

    def validate_first_name(self, value):
        return sanitize_text(value)

    def validate_last_name(self, value):
        return sanitize_text(value)


class UserStatusSerializer(serializers.Serializer):
    active = serializers.BooleanField()


class UserLockSerializer(serializers.Serializer):
    locked = serializers.BooleanField()
    minutes = serializers.IntegerField(min_value=1, max_value=1440, required=False)


class RoleAssignmentSerializer(serializers.Serializer):
    role_ids = serializers.ListField(
        child=serializers.UUIDField(),
        allow_empty=True,
    )


class PermissionAssignmentSerializer(serializers.Serializer):
    permission_ids = serializers.ListField(
        child=serializers.UUIDField(),
        allow_empty=True,
    )


class DocumentRolePermissionSerializer(serializers.Serializer):
    role_id = serializers.UUIDField()
    permission_ids = serializers.ListField(
        child=serializers.UUIDField(),
        allow_empty=True,
    )


class DocumentPermissionsSerializer(serializers.Serializer):
    assignments = serializers.ListField(
        child=DocumentRolePermissionSerializer(),
        allow_empty=True,
    )


class PermissionCreateSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=80, trim_whitespace=True)
    name = serializers.CharField(max_length=120, trim_whitespace=True)
    module = serializers.CharField(max_length=50, trim_whitespace=True)
    description = serializers.CharField(required=False, allow_blank=True)

    def validate_code(self, value):
        return sanitize_text(value)

    def validate_name(self, value):
        return sanitize_text(value)

    def validate_module(self, value):
        return sanitize_text(value)

    def validate_description(self, value):
        return sanitize_text(value)


class PermissionUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120, trim_whitespace=True, required=False)
    module = serializers.CharField(max_length=50, trim_whitespace=True, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    active = serializers.BooleanField(required=False)

    def validate_name(self, value):
        return sanitize_text(value)

    def validate_module(self, value):
        return sanitize_text(value)

    def validate_description(self, value):
        return sanitize_text(value)


class RoleCreateSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=50, trim_whitespace=True)
    name = serializers.CharField(max_length=120, trim_whitespace=True)
    description = serializers.CharField(required=False, allow_blank=True)

    def validate_name(self, value):
        return sanitize_text(value)

    def validate_description(self, value):
        return sanitize_text(value)


class RoleUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120, trim_whitespace=True, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    active = serializers.BooleanField(required=False)

    def validate_name(self, value):
        return sanitize_text(value)

    def validate_description(self, value):
        return sanitize_text(value)
