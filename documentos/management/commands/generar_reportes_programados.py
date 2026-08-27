import calendar
from datetime import datetime, timedelta
from types import SimpleNamespace

from django.core.management.base import BaseCommand
from django.utils import timezone

from documentos.models import ProgramacionReporte, ReporteGenerado, UsuarioDocumental
from documentos.reports_views import build_report_data


def next_execution(value, frequency):
    if frequency == 'daily':
        return value + timedelta(days=1)
    if frequency == 'weekly':
        return value + timedelta(days=7)
    month = value.month % 12 + 1
    year = value.year + (value.month // 12)
    day = min(value.day, calendar.monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


class Command(BaseCommand):
    help = 'Genera los reportes cuya programación ya está vencida.'

    def handle(self, *args, **options):
        now = timezone.now()
        schedules = ProgramacionReporte.objects.filter(activa=True, proxima_ejecucion_en__lte=now)
        generated = 0
        for schedule in schedules:
            user = UsuarioDocumental.objects.get(pk=schedule.creado_por_id)
            request = SimpleNamespace(user=user)
            data = build_report_data(request, schedule.alcance, schedule.filtros)
            ReporteGenerado.objects.create(
                organizacion_id=schedule.organizacion_id,
                generado_por_id=schedule.creado_por_id,
                alcance=schedule.alcance,
                formato=schedule.formato,
                nombre=schedule.nombre,
                filtros=schedule.filtros,
                filas=len(data['rows']),
            )
            next_run = schedule.proxima_ejecucion_en
            while next_run <= now:
                next_run = next_execution(next_run, schedule.frecuencia)
            schedule.proxima_ejecucion_en = next_run
            schedule.save(update_fields=['proxima_ejecucion_en', 'actualizada_en'])
            generated += 1
        self.stdout.write(self.style.SUCCESS(f'{generated} reportes programados generados.'))
