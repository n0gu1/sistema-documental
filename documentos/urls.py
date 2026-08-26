from django.urls import path

from . import views
from . import management_views
from . import document_views

urlpatterns = [
    path('auth/csrf/', views.CsrfTokenView.as_view(), name='auth-csrf'),
    path('auth/login/', views.LoginView.as_view(), name='auth-login'),
    path('auth/me/', views.CurrentUserView.as_view(), name='auth-current-user'),
    path('auth/logout/', views.LogoutView.as_view(), name='auth-logout'),
    path('auth/change-password/', views.ChangePasswordView.as_view(), name='auth-change-password'),
    path('admin/users/', management_views.UserListCreateView.as_view(), name='admin-users'),
    path('admin/users/<uuid:user_id>/', management_views.UserDetailView.as_view(), name='admin-user-detail'),
    path('admin/users/<uuid:user_id>/status/', management_views.UserStatusView.as_view(), name='admin-user-status'),
    path('admin/users/<uuid:user_id>/lock/', management_views.UserLockView.as_view(), name='admin-user-lock'),
    path('admin/users/<uuid:user_id>/reset-password/', management_views.UserResetPasswordView.as_view(), name='admin-user-reset-password'),
    path('admin/users/<uuid:user_id>/roles/', management_views.UserRolesView.as_view(), name='admin-user-roles'),
    path('admin/users/<uuid:user_id>/sessions/', management_views.UserSessionsView.as_view(), name='admin-user-sessions'),
    path('admin/sessions/<uuid:session_id>/revoke/', management_views.SessionRevokeView.as_view(), name='admin-session-revoke'),
    path('admin/roles/', management_views.RoleListCreateView.as_view(), name='admin-roles'),
    path('admin/roles/<uuid:role_id>/', management_views.RoleDetailView.as_view(), name='admin-role-detail'),
    path('admin/roles/<uuid:role_id>/permissions/', management_views.RolePermissionsView.as_view(), name='admin-role-permissions'),
    path('admin/permissions/', management_views.PermissionListView.as_view(), name='admin-permissions'),
    path('documents/', document_views.DocumentListCreateView.as_view(), name='documents'),
    path('documents/export/', document_views.DocumentExportView.as_view(), name='document-export'),
    path('documents/<uuid:document_id>/', document_views.DocumentDetailView.as_view(), name='document-detail'),
    path('documents/<uuid:document_id>/archive/', document_views.DocumentArchiveView.as_view(), name='document-archive'),
    path('documents/<uuid:document_id>/files/', document_views.DocumentFileListCreateView.as_view(), name='document-files'),
    path('documents/<uuid:document_id>/versions/', document_views.DocumentVersionListView.as_view(), name='document-versions'),
    path('documents/<uuid:document_id>/versions/compare/', document_views.DocumentVersionCompareView.as_view(), name='document-version-compare'),
    path('documents/<uuid:document_id>/timeline/', document_views.DocumentVersionTimelineView.as_view(), name='document-version-timeline'),
    path(
        'documents/<uuid:document_id>/files/<uuid:file_id>/download/',
        document_views.DocumentFileDownloadView.as_view(),
        name='document-file-download',
    ),
    path(
        'documents/<uuid:document_id>/versions/<uuid:version_id>/download/',
        document_views.DocumentVersionDownloadView.as_view(),
        name='document-version-download',
    ),
    path(
        'documents/<uuid:document_id>/files/<uuid:file_id>/preview/',
        document_views.DocumentFilePreviewView.as_view(),
        name='document-file-preview',
    ),
    path('health/', views.HealthView.as_view(), name='health'),
]
