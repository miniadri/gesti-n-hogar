# Integración con Home Assistant (vinculación externa de dispositivos)

## Objetivo
Permitir que HomeSync controle y consulte estado de aparatos del hogar (luces, enchufes, sensores, electrodomésticos) usando **Home Assistant** como puente universal, sin acoplarnos a un fabricante concreto (Philips Hue, Xiaomi, Shelly, Zigbee, Z-Wave, etc. quedan cubiertos porque HA ya los soporta).

## Enfoque general
Cada hogar conecta **su propia instancia de Home Assistant** (autoalojada en Nabu Casa, Raspberry Pi, HAOS, etc.) proporcionando:
- **URL base** (p. ej. `https://ha.miurl.com` o Nabu Casa Cloud URL)
- **Long-Lived Access Token** generado en el perfil de HA

Estas credenciales se guardan **cifradas en la BD**, se leen sólo desde server functions, y todas las llamadas a HA salen desde el servidor (nunca desde el navegador → evita CORS y no expone el token).

```text
Navegador ─► serverFn (TanStack) ─► Home Assistant REST API ─► dispositivo
                    ▲
                    └── credenciales cifradas por household
```

## Fases

### Fase 1 — Conexión y descubrimiento
1. Nueva tabla `home_assistant_connections` (una por hogar): `household_id`, `base_url`, `token_ciphertext`, `status`, `last_synced_at`.
2. Secret `HA_TOKEN_SECRET` (AES-256-GCM) para cifrar/descifrar tokens.
3. UI en **Ajustes → Hogar → Home Assistant**:
   - Formulario "URL + token" con enlace a la guía de HA para generar el token.
   - Botón "Probar conexión" → `GET /api/` de HA para validar.
4. Server function `syncHomeAssistantEntities` → llama a `GET /api/states`, filtra por dominios útiles (`light`, `switch`, `climate`, `sensor`, `binary_sensor`, `cover`, `media_player`, `vacuum`) y guarda en `devices` (reutilizamos la tabla existente añadiendo `external_source='home_assistant'` y `external_id=entity_id`).

### Fase 2 — Control y estado
1. Server functions:
   - `callHomeAssistantService({ domain, service, entity_id, data })` → `POST /api/services/{domain}/{service}`.
   - `getHomeAssistantState(entity_id)` → `GET /api/states/{entity_id}`.
2. En la pantalla **/devices**: para cada dispositivo con `external_source='home_assistant'` mostrar controles según su dominio:
   - Luz: on/off, brillo, color.
   - Enchufe/switch: on/off + consumo si el atributo existe.
   - Termostato: temperatura objetivo, modo.
   - Sensor: valor + unidad, sin control.
3. Refresco: polling cada 30–60 s vía TanStack Query mientras la pantalla está abierta.

### Fase 3 — Reglas cruzadas con HomeSync (opcional)
Aprovechar el resto de módulos:
- **Modo cocina**: al abrir el kiosco, encender luz de cocina vía HA.
- **Tareas**: acción "regar plantas" enciende la electroválvula.
- **Notificaciones**: alerta si un sensor de humedad/temperatura del frigorífico se sale de rango.
- **Escenas**: guardar combinaciones y ejecutarlas desde el dashboard.

### Fase 4 — Alternativas y ampliaciones (documentadas, no implementadas)
- **Webhook entrante** `/api/public/hooks/ha-event` para que HA nos empuje cambios en tiempo real (evita polling).
- **WebSocket API de HA** para estado en vivo desde el servidor.
- Integración directa con Matter/Zigbee2MQTT sólo si algún usuario no quiere HA.
- Otros hubs: Google Home / Alexa quedarían como fase posterior (requieren OAuth y skills certificadas).

## Detalles técnicos
- **Almacenamiento cifrado**: mismo patrón que ya documenta el proyecto para claves de conexión (AES-256-GCM, IV+tag+ciphertext en base64, clave `HA_TOKEN_SECRET` en env).
- **Servidor único punto de contacto**: nunca exponer `base_url` ni token al cliente; sólo devolver el estado ya normalizado.
- **RLS**: sólo miembros del hogar pueden leer/escribir su `home_assistant_connections`; sólo admin puede editar credenciales.
- **i18n**: añadir claves `nav.smartHome`, `ha.connect`, `ha.token`, `ha.testConnection`, `ha.connected`, `ha.error` en `es.ts`/`en.ts`.
- **Errores**: si HA devuelve 401 → marcar `status='invalid_token'` y pedir reconexión; si 5xx o timeout → `status='unreachable'` con banner en /devices.
- **Realtime**: excluir la tabla del canal Realtime (cambia poco); actualizar vía invalidate tras acciones.

## Fuera de alcance de este plan
- Configurar HA por el usuario (queda del lado del usuario, sólo enlazamos guía oficial).
- Instalación en la nube de HA gestionada por HomeSync.
- Integraciones directas fabricante-a-fabricante sin pasar por HA.

## Entregable de la primera iteración
Fase 1 + Fase 2 completas: el usuario puede conectar HA, ver sus entidades en /devices y encender/apagar luces y enchufes desde HomeSync.
