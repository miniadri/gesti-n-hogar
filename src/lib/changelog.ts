export type ChangelogEntry = {
  version: string;
  title: string;
  date?: string;
  highlights: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
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
