export type ChangelogEntry = {
  version: string;
  title: string;
  date?: string;
  highlights: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "v0.79",
    title: "Contador de compra y próxima toma",
    highlights: [
      "La tarjeta Por comprar muestra el total real de productos pendientes de todas las listas, no solo los primeros cinco.",
      "Próxima toma ignora registros pendientes vencidos y muestra la siguiente toma futura de cada miembro.",
      "Una toma antigua pendiente ya no puede hacer que aparezcan acciones de otra toma futura antes de su ventana de una hora.",
    ],
  },
  {
    version: "v0.78",
    title: "Corrección de Dashboard y Telegram",
    highlights: [
      "Dashboard vuelve a cargar correctamente al restaurar los iconos de las acciones de medicación.",
      "Los avisos de medicación por Telegram recuperan Tomada, +10 min y Omitir.",
      "La ventana de una hora y la confirmación siguen aplicándose únicamente en la interfaz web de Inicio y Salud.",
    ],
  },
  {
    version: "v0.77",
    title: "Confirmación protegida de medicación",
    highlights: [
      "Tomada y Omitida vuelven a estar disponibles únicamente desde una hora antes de cada toma programada.",
      "Inicio y Salud piden una confirmación explícita antes de registrar la acción; antes de la ventana no muestran esos botones.",
      "El servidor aplica la misma regla y evita que dos pulsaciones descuenten stock dos veces.",
    ],
  },
  {
    version: "v0.76",
    title: "Tomas protegidas y avisos de Cuadrante",
    highlights: [
      "Las tomas activas solo permiten posponer 10 minutos; se eliminan las acciones de confirmar u omitir en Salud, Inicio y Telegram.",
      "Cuadrante vuelve a ejecutar su programador en el despliegue de Cloudflare y avisa al comienzo y al final del turno por Push y Telegram.",
      "Si ningún canal acepta un aviso de Cuadrante, se libera para que el siguiente ciclo lo reintente.",
    ],
  },
  {
    version: "v0.75",
    title: "Etiquetas disponibles siempre a mano",
    highlights: [
      "Las etiquetas QR sin asignar permanecen visibles al volver a Etiquetas QR y NFC.",
      "Se pueden imprimir de nuevo cuando haga falta y se ocultan automáticamente al vincularlas a un producto.",
    ],
  },
  {
    version: "v0.74",
    title: "Acceso funcional a la lectura de etiquetas",
    highlights: [
      "La ruta de lectura QR y NFC ya muestra su pantalla de escaneo, vínculo y ajuste de stock.",
      "Los botones de Etiquetas y las URL impresas llevan ahora a esa pantalla en lugar de volver silenciosamente al listado.",
    ],
  },
  {
    version: "v0.73",
    title: "Etiquetas QR y NFC con alternativa fiable",
    highlights: [
      "Además del lector en directo, Etiquetas permite hacer una foto del QR con la cámara nativa del móvil, igual que en Finanzas.",
      "La lectura NFC muestra su estado y admite los registros URL estándar programados por HomeSync.",
      "Una URL o código sin reserva muestra claramente qué etiqueta falta en lugar de una pantalla sin acción.",
    ],
  },
  {
    version: "v0.72",
    title: "Lectura de etiquetas más fiable",
    highlights: [
      "El lector de Etiquetas QR abre la cámara directamente, igual que la prueba de cámara de Ajustes.",
      "Si el navegador no puede abrirla, se puede reintentar desde la misma pantalla.",
      "Etiquetas QR muestra ahora un acceso visible para leer y programar NFC.",
    ],
  },
  {
    version: "v0.71",
    title: "Etiquetas QR y NFC utilizables",
    highlights: [
      "Los QR nuevos contienen una URL de HomeSync que abre directamente la acción rápida, también desde Lens.",
      "El lector QR pide activar la cámara mediante un toque y deja de reiniciarla durante la lectura.",
      "En Android con Chrome o la PWA se puede leer y programar una etiqueta NFC con el mismo acceso que el QR.",
    ],
  },
  {
    version: "v0.70",
    title: "Etiquetas QR para inventario",
    highlights: [
      "Genera lotes imprimibles de etiquetas QR consecutivas y los reserva por hogar y serie.",
      "Una etiqueta se vincula a un producto para consultar, consumir o reponer stock desde una única pantalla rápida.",
      "Las series de frigorífico, congelador, armario, medicina y general organizan la impresión sin bloquear el cambio posterior de ubicación.",
    ],
  },
  {
    version: "v0.67",
    title: "Avisos de medicación sin duplicados",
    highlights: [
      "Cada recordatorio se reserva en la base de datos antes de enviarse, evitando avisos simultáneos duplicados.",
      "Las tomas futuras quedan protegidas contra duplicados generados por ejecuciones concurrentes.",
    ],
  },
  {
    version: "v0.66",
    title: "Inventario más compacto",
    highlights: [
      "Frigorífico, congelador y armario se pliegan individualmente para reducir la longitud de la pantalla.",
      "Los productos caducados o que caducan en los próximos 7 días permanecen siempre visibles en una sección prioritaria.",
    ],
  },
  {
    version: "v0.65",
    title: "Escáner en la lista de compra",
    highlights: [
      "El acceso de tickets de Lista de compra pasa a escanear códigos de producto.",
      "Tras reconocer o nombrar el producto, se añade directamente a la lista predeterminada sin duplicarlo.",
    ],
  },
  {
    version: "v0.64",
    title: "Edicion de stock de medicacion",
    highlights: [
      "Se normalizan los horarios recibidos como HH:MM:SS antes de validar y guardar una medicacion.",
      "Ya se puede modificar el stock sin que un horario existente bloquee la actualizacion.",
    ],
  },
  {
    version: "v0.63",
    title: "Changelog integrado",
    highlights: [
      "La version visible en Ajustes abre un resumen de cambios de la webapp.",
      "Se actualiza la documentacion privada de continuidad del proyecto.",
    ],
  },
  {
    version: "v0.62",
    title: "Recordatorios de medicacion mas robustos",
    highlights: [
      "Las tomas omitidas o confirmadas desde la web dejan de reenviarse por Telegram o push.",
      "Telegram reconoce botones antiguos de tomas ya registradas sin reactivar avisos.",
    ],
  },
  {
    version: "v0.61",
    title: "Cron de medicacion y avisos SOS",
    highlights: [
      "Recordatorios de medicacion programados desde Supabase hacia Cloudflare.",
      "Reavisos SOS mientras la emergencia no se confirme.",
      "Boton SOS reforzado para Android/PWA.",
    ],
  },
  {
    version: "v0.60",
    title: "Equivalencias entre tiendas",
    highlights: [
      "Al mover productos entre tiendas se buscan equivalencias aunque cambie el orden de palabras.",
      "Si no hay coincidencia clara, se limpia el precio y enlace de la tienda anterior.",
      "Se puede seleccionar manualmente el producto equivalente desde la tienda destino.",
    ],
  },
  {
    version: "v0.57",
    title: "Push en Android/PWA",
    highlights: [
      "Mejor registro y reparacion del service worker.",
      "Pruebas locales y remotas de notificaciones push desde Ajustes.",
      "Compatibilidad mejorada con Chrome en Android y app instalada.",
    ],
  },
  {
    version: "v0.54",
    title: "OCR Gemini y voz en Kiosko",
    highlights: [
      "El OCR de tickets puede usar Gemini fuera de Lovable Cloud.",
      "El asistente de voz queda disponible en la cabecera del modo Kiosko.",
      "Los miembros pueden cambiar su propio nombre visible en Familia.",
    ],
  },
  {
    version: "v0.50",
    title: "Modo Kiosko",
    highlights: [
      "Pantalla simplificada para cocina con botones grandes.",
      "Usuario virtual Kiosko cocina para registrar acciones del dispositivo fijo.",
      "Accesos rapidos a compra, inventario, tareas, recetas, salud, calendario, escaner y SOS.",
    ],
  },
  {
    version: "v0.30",
    title: "Lista de deseos",
    highlights: [
      "Lista de Deseos dentro de Tareas.",
      "Deseos propios o sugeridos a otros miembros.",
      "Reservas secretas para que el destinatario no vea quien prepara el regalo.",
    ],
  },
  {
    version: "v0.29",
    title: "Google Calendar externo",
    highlights: [
      "OAuth propio por usuario fuera de Lovable.",
      "Eventos privados por defecto y compartibles manualmente con el hogar.",
      "Sincronizacion manual como base para cron posterior.",
    ],
  },
  {
    version: "v0.25",
    title: "Cloudflare + Supabase propio",
    highlights: [
      "Despliegue externo en Cloudflare Pages.",
      "Backend de pruebas en Supabase propio.",
      "Lovable queda como editor auxiliar, no como entorno real obligatorio.",
    ],
  },
];
