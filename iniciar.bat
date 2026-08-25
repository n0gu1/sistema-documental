#!/bin/bash
echo "=== Sistema Documental ==="
echo ""
echo "Iniciando Backend (Django) en http://localhost:8000..."
echo "Iniciando Frontend (React) en http://localhost:5173..."
echo ""

# Iniciar Django en background
cd backend && python ../manage.py runserver &
DJANGO_PID=$!

# Iniciar React
cd ../frontend && npm run dev &
REACT_PID=$!

echo ""
echo "Backend:  http://localhost:8000/api/hola-mundo/"
echo "Frontend: http://localhost:5173"
echo ""
echo "Presiona Ctrl+C para detener ambos servidores"

# Esperar
wait $DJANGO_PID $REACT_PID
