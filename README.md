# AVE Dashboard

Dashboard de métricas para ventas, entregas y mermas.

## Cómo subir a Vercel (primera vez)

1. Ve a github.com y crea un repositorio nuevo llamado `ave-dashboard`
2. Sube todos estos archivos al repositorio
3. Ve a vercel.com → "Add New Project" → selecciona el repositorio `ave-dashboard`
4. Vercel detecta Vite automáticamente → clic en "Deploy"
5. En ~1 minuto tendrás una URL tipo `ave-dashboard.vercel.app`
6. Desde el celular: abre esa URL en Safari → compartir → "Agregar a pantalla de inicio"

## Cómo actualizar

1. Recibe el archivo App.jsx actualizado desde Claude
2. En GitHub, entra al repositorio → carpeta `src` → `App.jsx`
3. Clic en el lápiz (editar) → pega el nuevo contenido → "Commit changes"
4. Vercel actualiza automáticamente en ~30 segundos

## Estructura
```
ave-dashboard/
├── index.html
├── package.json
├── vite.config.js
├── public/
│   ├── manifest.json
│   ├── icon-192.png
│   └── icon-512.png
└── src/
    ├── main.jsx
    └── App.jsx   ← este es el que se actualiza
```
