# Scraper local de libros para Librélula

Esta herramienta recopila metadatos públicos de fichas de libros y genera un
archivo para revisión. No escribe directamente en Supabase ni publica libros.

El scraper se ejecuta únicamente en tu ordenador. React y Vercel no necesitan
Python.

## 1. Abrir PowerShell

Sitúate en esta carpeta:

```powershell
cd C:\Users\sofia\Desktop\libr-lula-original-github\tools\scraping_libros
```

## 2. Crear el entorno de Windows

```powershell
py -m venv .venv
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r .\requirements.txt
```

La carpeta `.venv` es local, está ignorada por Git y no debe compartirse en un
ZIP.

## 3. Ejecutar una prueba de una página

```powershell
New-Item -ItemType Directory -Force .\salidas | Out-Null
scrapy crawl libro -a max_paginas=1 -O .\salidas\libros.json
```

El proyecto usa una sola petición simultánea y espera entre solicitudes.
Las respuestas incompletas o no disponibles se dejan pendientes de revisión.

## 4. Preparar el archivo para Librélula

```powershell
python .\scripts\preparar_importacion.py `
    .\salidas\libros.json `
    .\salidas\librelula_import.json
```

El segundo archivo:

- normaliza ISBN y páginas;
- adapta géneros conocidos a la taxonomía de Librélula;
- conserva edición y URL de procedencia;
- detecta duplicados internos;
- marca errores y avisos;
- mantiene las sinopsis como contenido pendiente de revisión.

## 5. Calcular los colores desde las portadas

```powershell
python .\scripts\enriquecer_colores.py `
    .\salidas\librelula_import.json `
    .\salidas\librelula_con_colores.json
```

Importa el archivo `librelula_con_colores.json`. El script conserva el tono
predominante de cada portada, elimina el margen blanco de las fotos y ajusta
la luminosidad para el texto del panel de detalles. Guarda `hero_color` en
el JSON y deja constancia de la imagen analizada. Si una portada falla,
detiene la preparación para evitar asignarle silenciosamente un fondo gris.

Antes de importar, revisa obra frente a reedición, idioma, coautorías y orden
de saga. Un número de colección editorial no equivale a una saga narrativa.

## 6. Salir del entorno

```powershell
deactivate
```

El importador de administración permite seleccionar registros del JSON y
añadirlos mediante la API del catálogo.
