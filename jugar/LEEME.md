# EVONG para navegador

Versión web de EVONG (eAdventure 1.x) que funciona sin Java ni plugins. Es una
traducción a JavaScript del motor original: los datos del juego (`chapter1.xml`,
imágenes, música) son los mismos que los del `.jar`.

## Publicar

Es un sitio estático: basta con copiar esta carpeta tal cual a un servidor web y abrir
`index.html`. En este repositorio está en `jugar/`, debajo de la página de presentación:

- Español: `https://evong.evalfor.net/jugar/`
- Inglés: `https://evong.evalfor.net/jugar/#en` (o `jugar/en/`, que redirige ahí)

No hace falta configurar nada en el servidor. Los archivos `.bin` son paquetes de
imágenes; si algún alojamiento no los sirviera, se puede generar la variante con
paquetes `.txt` (base64).

## Contenido

| Ruta | Qué es |
|---|---|
| `index.html` | Página del juego (botón Jugar, pantalla completa, cambio ES/EN) |
| `js/` | Motor (datos, gráficos, sonido, estados del juego) y fuentes incrustadas |
| `data/game-es.json`, `data/game-en.json` | Capítulo, descriptor y textos del motor de cada idioma |
| `assets/*.bin` | Imágenes empaquetadas (comunes, por idioma, primer plano y páginas de libros) |
| `assets/audio/` | Música y efectos (MP3) |
| `fonts/` | Licencias de las tipografías Arimo y Quicksand (SIL OFL 1.1) |

## Controles

- Clic izquierdo: mirar / acción principal; clic en una puerta o zona de salida para moverse.
- Clic derecho (o doble clic): botones de acción.
- En pantallas táctiles, tocar un objeto abre directamente sus botones de acción (lo que en el PC hace el clic derecho); la pulsación larga también funciona. La pantalla de inicio lo indica en los dispositivos táctiles.
- En pantallas táctiles, en las conversaciones el primer toque resalta una respuesta y el segundo la elige (las líneas son pequeñas para un dedo); en los libros, tocar fuera de las flechas cierra el libro (en el PC, clic derecho).
- Inventario: acercar el ratón al borde inferior (en táctil, tocar abajo).
- Esc o el botón ☰ de la barra superior (útil en móviles y tabletas): menú de opciones (guardar/cargar partida, música, efectos, velocidad del texto).

Las partidas guardadas se almacenan en el propio navegador (localStorage).

## Diferencias deliberadas con el original

- Abrir un libro desde el inventario en la pantalla de ayuda ya no deja inutilizado el
  botón «Volver» (fallo del motor original que dejaba al jugador atrapado).
- Tocar el inventario en una pantalla táctil sin haberlo desplegado antes ya no provoca
  un error del motor.
- «Salir del juego» y el final muestran un aviso con la opción de volver a empezar en
  lugar de cerrar la ventana.
- «Generar informe» no hace nada (en el original abría un informe de evaluación vacío).
