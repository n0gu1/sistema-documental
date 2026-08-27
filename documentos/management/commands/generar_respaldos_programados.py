from django.core.management.base import BaseCommand
from django.utils import timezone

from documentos.backup_service import BackupExecutionError, create_backup, next_execution
from documentos.models import ConfiguracionRespaldo


class Command(BaseCommand):
    help = 'Ejecuta los respaldos automaticos vencidos y actualiza su proxima ejecucion.'

    def handle(self, *args, **options):
        now = timezone.now()
        configurations = ConfiguracionRespaldo.objects.filter(
            activa=True,
            proxima_ejecucion_en__lte=now,
        )
        processed = 0
        failed = 0
        for config in configurations.iterator():
            processed += 1
            try:
                backup, stats = create_backup(
                    config.organizacion_id,
                    backup_type='automatico',
                    config=config,
                )
                self.stdout.write(self.style.SUCCESS(f'Respaldo {backup.id} creado ({stats["records"]} registros).'))
            except BackupExecutionError:
                failed += 1
                config.proxima_ejecucion_en = next_execution(config.frecuencia, now)
                config.actualizada_en = timezone.now()
                config.save(update_fields=['proxima_ejecucion_en', 'actualizada_en'])
                self.stderr.write(self.style.ERROR(f'Fallo el respaldo automatico de {config.organizacion_id}.'))
        self.stdout.write(f'Procesados: {processed}. Fallidos: {failed}.')
