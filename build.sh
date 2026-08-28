#!/bin/bash
# Build script for Render
npm ci --prefix frontend --include=dev
npm run build --prefix frontend
pip install -r requirements.txt
python manage.py collectstatic --noinput
python manage.py migrate
