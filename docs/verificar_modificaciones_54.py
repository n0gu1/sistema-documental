"""#54: compare persisted audit JSON with exact single-field modifications."""
import os, sys, json
from pathlib import Path
from uuid import uuid4
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE','backend.settings')
import django
django.setup()
from django.db import transaction, connection
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate
from documentos import document_views as dv, management_views as mv
from documentos.settings_views import SystemSettingsView
from documentos.config_service import get_system_config, serialize_system_config
from documentos.models import UsuarioDocumental, Documento, AreaCatalogo, TipoDocumentoCatalogo, RolDocumental, PermisoDocumental
from documentos.audit_changes import modification_changes, settings_snapshot

admin=UsuarioDocumental.objects.get(correo='prueba.admin@test.local')
editor=UsuarioDocumental.objects.get(correo='prueba.editor@test.local')
checks=[]
events=[]
def call(view, data, method='patch', **kwargs):
    request=getattr(APIRequestFactory(),method)('/api/',data,format='json')
    force_authenticate(request,user=admin)
    response=view.as_view()(request,**kwargs)
    assert response.status_code==200,(view.__name__,response.status_code,response.data)
    return response
def exact(resource,action,expected,label):
    with connection.cursor() as cursor:
        cursor.execute('''SELECT b.id,b.detalles FROM gestion_documental.bitacora_auditoria b
          JOIN gestion_documental.acciones_auditoria a ON a.id=b.accion_id
          WHERE b.recurso_id=%s AND a.codigo=%s ORDER BY b.id DESC LIMIT 1''',[resource,action])
        row=cursor.fetchone()
    assert row,label
    details=json.loads(row[1]) if isinstance(row[1],str) else row[1]
    assert details['changes']==expected,(label,details,expected)
    checks.append(label)
    events.append({'id':row[0],'action':action,'details':details})
with override_settings(ALLOWED_HOSTS=['testserver']),transaction.atomic():
    now=timezone.now()
    doc=Documento.objects.create(id=uuid4(),organizacion_id=admin.organizacion_id,area=AreaCatalogo.objects.filter(organizacion_id=admin.organizacion_id,activa=True).first(),tipo_documento=TipoDocumentoCatalogo.objects.filter(activo=True).first(),codigo='AUD54-'+uuid4().hex[:10].upper(),nombre='Título original',creado_por=admin,creado_en=now,actualizado_en=now)
    call(dv.DocumentDetailView,{'title':'Título corregido'},document_id=doc.id)
    exact(doc.id,'DOCUMENTO_MODIFICADO',[{'field':'title','before':'Título original','after':'Título corregido'}],'Un campo: exactamente title con anterior/nuevo')
    call(dv.DocumentDetailView,{'title':'Título corregido'},document_id=doc.id)
    exact(doc.id,'DOCUMENTO_MODIFICADO',[],'Mismo valor: cero diferencias')
    call(dv.DocumentDetailView,{'metadata':{'classification':'Interno','password':'SECRETO54','access_token':'TOKEN54','custom':'CREDENCIAL54'}},document_id=doc.id)
    exact(doc.id,'DOCUMENTO_MODIFICADO',[{'field':'metadata.classification','before':None,'after':'Interno'}],'Metadatos: solo campo descriptivo permitido')
    call(dv.DocumentDetailView,{'metadata':{}},document_id=doc.id)
    exact(doc.id,'DOCUMENTO_MODIFICADO',[{'field':'metadata.classification','before':'Interno','after':None}],'Eliminación de metadato')
    old_name=editor.nombres
    call(mv.UserDetailView,{'first_name':'Ensayo54'},user_id=editor.id)
    exact(editor.id,'USUARIO_MODIFICADO',[{'field':'first_name','before':old_name,'after':'Ensayo54'}],'Usuario: un campo sin hash ni credenciales')
    role=RolDocumental.objects.create(id=uuid4(),organizacion_id=admin.organizacion_id,codigo='AUD54_'+uuid4().hex[:8],nombre='Rol ensayo 54',descripcion='Anterior',activo=True,creado_en=now,actualizado_en=now)
    call(mv.RoleDetailView,{'description':'Nueva'},role_id=role.id)
    exact(role.id,'ROL_MODIFICADO',[{'field':'description','before':'Anterior','after':'Nueva'}],'Rol: una descripción')
    perm=PermisoDocumental.objects.create(id=uuid4(),codigo='aud54.'+uuid4().hex[:8],nombre='Ensayo',modulo='anterior',descripcion='',activo=True)
    call(mv.PermissionDetailView,{'module':'nuevo'},permission_id=perm.id)
    exact(perm.id,'PERMISO_MODIFICADO',[{'field':'module','before':'anterior','after':'nuevo'}],'Permiso: un módulo')
    call(mv.RolePermissionsView,{'permission_ids':[str(perm.id)]},method='put',role_id=role.id)
    exact(role.id,'PERMISO_MODIFICADO',[{'field':'permission_ids','before':[],'after':[str(perm.id)]}],'Asignación de permisos de rol')
    call(dv.DocumentPermissionsView,{'assignments':[], 'policies':[{'permission_id':str(perm.id),'mode':'DENEGAR'}]},method='put',document_id=doc.id)
    exact(doc.id,'DOCUMENTO_MODIFICADO',[{'field':'permission_policy.'+str(perm.id),'before':None,'after':'DENEGAR'}],'ACL: una política modificada')
    call(dv.DocumentPermissionsView,{'assignments':[{'role_id':str(role.id),'permission_ids':[str(perm.id)]}], 'policies':[{'permission_id':str(perm.id),'mode':'PERMITIR'}]},method='put',document_id=doc.id)
    exact(doc.id,'DOCUMENTO_MODIFICADO',sorted([
        {'field':'permission_policy.'+str(perm.id),'before':'DENEGAR','after':'PERMITIR'},
        {'field':f'permissions.{role.id}.{perm.id}','before':None,'after':True}],key=lambda x:x['field']),'ACL: política y concesión exactas')
    config=get_system_config(admin.organizacion_id)
    old_org_name=serialize_system_config(config)['general']['organization_name']
    call(SystemSettingsView,{'general':{'organization_name':'Ensayo de auditoría 54'}},method='post')
    config=get_system_config(admin.organizacion_id)
    exact(config.id,'CONFIGURACION_MODIFICADA',[{'field':'general.organization_name','before':old_org_name,'after':'Ensayo de auditoría 54'}],'Configuración: un campo sin credenciales SMTP')
    call(mv.UserStatusView,{'active':False},method='post',user_id=editor.id)
    exact(editor.id,'USUARIO_MODIFICADO',[{'field':'active','before':True,'after':False}],'Estado de usuario: un campo')
    # Pure snapshots cannot leak integration credentials or password fields.
    forbidden={name:'SECRETO54' for name in ['password','contraseña','access_token','client_secret','credentials','api_key','hash_contrasena']}
    assert modification_changes({},forbidden)==[]
    assert settings_snapshot({'smtp':{'username':'SECRETO54','password_token':'TOKEN54'}}).get('smtp.username') is None
    assert all(secret not in json.dumps(events) for secret in ['SECRETO54','TOKEN54','CREDENCIAL54',editor.hash_contrasena])
    checks.append('Sin contraseñas, tokens, credenciales ni metadatos desconocidos en cambios')
    transaction.set_rollback(True)
result={'result':'PASS','environment':'Django real / Neon / rollback','checks':checks,'document_id':str(doc.id),'event_ids':[e['id'] for e in events],'events':events}
(ROOT/'docs/resultado_modificaciones_54.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=True,indent=2))
