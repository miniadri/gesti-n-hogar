# Revisión de HogarSync y propuestas

Estado revisado hoy: 30 rutas, ~25.000 líneas en pantallas y funciones de servidor. Los módulos grandes (Medicación 1.481 líneas, Cuadrante 1.288, Dashboard 1.142, Compra 971, Tarjetas 1.104) están completos funcionalmente, pero la base ya pide una fase de consolidación antes de seguir añadiendo cosas.

## Lo que encontré ahora mismo

- **Registro médico a medias**: existe `src/lib/medical-records.functions.ts` y la tabla, y se usa desde Medicación, SOS y avisos, pero no hay una pantalla propia ni entrada en Ajustes. Es la funcionalidad más "a medio camino" del proyecto.
- **i18n solo cubre 8 de 30 pantallas**: el resto tiene los textos escritos directamente en español. El cambio de idioma a inglés hoy deja la mayoría de la app sin traducir.
- **Avisos de la base de datos**: el linter reporta 1 tabla con seguridad activada pero sin ninguna regla de acceso (queda bloqueada del todo), 7 funciones internas ejecutables por cualquier usuario registrado y 1 extensión instalada en el esquema público.
- **Sin pruebas automáticas**: no hay ninguna suite; los cálculos delicados (horas del cuadrante, extras, stock de medicación, importe de tickets) no están protegidos frente a regresiones.

## Propuesta por prioridad

### 1. Consolidación (recomendado hacer primero)
- Cerrar los avisos de base de datos: regla de acceso para la tabla sin políticas, restringir la ejecución de las funciones internas y mover la extensión fuera del esquema público.
- Tests de las fórmulas críticas: horas semanales/mensuales y extras del cuadrante, descuento de stock por toma, reparto de gastos por aportación.
- Refactorizar las 5 pantallas más largas dividiéndolas en componentes más pequeños y reutilizables (por ejemplo: las tarjetas del dashboard, la vista semanal/plantilla del cuadrante, el pastillero y el stock de medicación). La interfaz visible quedará exactamente igual; solo se reorganiza el código interno para que sea más fácil de mantener y probar.

### 2. Completar Registro médico
- Pantalla propia dentro de Medicación con condiciones, alergias a medicamentos y notas por miembro.
- Visibilidad por registro: solo yo / adultos del hogar / todo el hogar; los perfiles infantiles los gestionan los adultos.
- Aviso al crear una medicación que coincida con una alergia registrada.
- Bloque de emergencia (alergias y condiciones críticas) visible en la ficha SOS.

### 3. i18n completo
- Extraer los textos de las 22 pantallas restantes y completar el diccionario inglés, empezando por Dashboard, Compra, Inventario, Tareas y Cuadrante.

### 4. Nuevas funciones (elige las que te interesen)
- **Uso sin conexión**: cachear listas de compra e inventario y encolar los cambios para enviarlos al recuperar red. Es lo que más se nota en un supermercado con mala cobertura.
- **Resumen semanal del hogar**: un aviso los domingos con gasto de la semana, tareas pendientes, caducidades próximas y horas trabajadas.
- **Buscador global** (atajo de teclado) sobre productos, recetas, tareas, medicación y tarjetas.
- **Informe mensual de gastos** exportable en PDF, con evolución por categoría y comparativa entre meses.
- **Historial de precios por producto** con gráfica y aviso cuando algo sube por encima de un umbral.
- **Tareas: puntos y recompensas** para perfiles infantiles, aprovechando el `child_allowed` que ya existe.

## Detalles técnicos

- Sin cambios de arquitectura: se mantiene TanStack Start, funciones de servidor y el cliente generado del backend.
- Las migraciones nuevas incluirán los permisos y políticas correspondientes en la misma migración.
- El trabajo de troceado es puramente de presentación: misma lógica, mismos datos.
- Uso sin conexión sobre el service worker que ya existe (`public/sw.js`) más una cola local de cambios.

## Siguiente paso sugerido

Empezar por el bloque 1 (consolidación) y el 2 (registro médico), y elegir 2 o 3 funciones del bloque 4 para la siguiente iteración.
