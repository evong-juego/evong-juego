# EVONG · Evaluación en acción

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.24529824.svg)](https://doi.org/10.5281/zenodo.24529824)

*EVONG. Evaluación en acción* (*EVONG. Assessment in Action*) es un juego de simulación
con fines educativos en el que la persona que juega aborda tareas de evaluación. Es una aventura
gráfica en 2D en primera persona, ambientada en la creación y gestión de una ONG llamada
«InterAcción», que se juega desde tres perfiles:

- Coordinación de Economía y Calidad
- Coordinación de Proyectos
- Coordinación de Relaciones Institucionales

Cada perfil es como un pequeño juego, con actividades distintas en la misma ambientación,
de unos 20 minutos. La variable principal es el «Índice de éxito del área», que refleja
la correcta consecución de las tareas de evaluación.

Está pensado para estudiantado universitario de los primeros cursos de cualquier área,
y también puede usarse en otros niveles y en contextos no formales e informales.
Sus objetivos educativos son:

- Aplicar los conocimientos adquiridos sobre evaluación, estableciendo criterios y
  realizando valoraciones ajustadas al objeto evaluado.
- Tomar decisiones de forma razonada y consecuente, conociendo las opciones
  disponibles y las metas, y proponiendo estrategias orientadas a conseguirlas.

## Jugar

- **En el navegador** (ordenador, tableta o móvil, sin instalar nada):
  <https://evong.evalfor.net/> (página del juego) · <https://evong.evalfor.net/jugar/> (directamente al juego).
  En inglés: <https://evong.evalfor.net/en/> y <https://evong.evalfor.net/jugar/#en>.
- **Versión original para Java**: [`java/evong-es.jar`](java/evong-es.jar) (español) y
  [`java/evong-en.jar`](java/evong-en.jar) (inglés). Se abren con `java -jar` y
  necesitan Java instalado.

## Contenido del repositorio

| Ruta | Qué es |
|---|---|
| `jugar/` | Versión web: el juego original funcionando en el navegador, en español e inglés (detalles técnicos en [`jugar/LEEME.md`](jugar/LEEME.md)) |
| `java/evong-es.jar` | Versión original para Java en español (distribuida como `evong-09.jar`, 2015) |
| `java/evong-en.jar` | Versión original para Java en inglés (distribuida como `evon_eng.jar`, 2015) |
| `index.html`, `en/`, `web.css`, `img/`, `fonts/` | Página de presentación del juego, en español y en inglés (tipografía Dosis, licencia SIL OFL 1.1 en `fonts/`) |

La versión web reimplementa en JavaScript el motor eAdventure con el que se hizo el
juego y usa los mismos datos, imágenes y sonidos que la versión Java.

### Usarlo sin conexión

La carpeta `jugar/` es un sitio web estático. No funciona abriendo `index.html` con doble
clic, porque el navegador no deja leer los datos del juego desde el disco; hay que servirla
desde un servidor web, aunque sea uno local. Por ejemplo, desde la carpeta del repositorio:

```
python3 -m http.server 8000
```

y abrir <http://localhost:8000/jugar/> en el navegador.

## Créditos

Según la pantalla de créditos del propio juego:

- **Dirección**: Gregorio Rodríguez Gómez y María Soledad Ibarra Sáiz (Grupo de Investigación EVALfor, Universidad de Cádiz)
- **Guion**: Miguel Ángel Gómez Ruiz (Grupo de Investigación EVALfor, Universidad de Cádiz)
- **Ilustración y animación**: David Nieto Rojas ([deividart.com](http://www.deividart.com))
- **Programación**: Juan Antonio Caballero Hernández (Grupo de Investigación EVALfor, Universidad de Cádiz)
- **Reconocimientos (música)**: efectos de sonido de [freesound.org](https://freesound.org);
  «Brittle Rille», «Rollin at 5» y «Carefree», de Kevin MacLeod
  ([incompetech.com](https://incompetech.com)), con licencia
  [Creative Commons Reconocimiento](https://creativecommons.org/licenses/by/4.0/deed.es)
- Desarrollado con [eAdventure](https://e-adventure.e-ucm.es/) (e-UCM, Universidad Complutense de Madrid)
- Tipografías de la versión web: Arimo y Quicksand ([SIL Open Font License 1.1](https://openfontlicense.org))

Juego realizado en el marco del Proyecto DevalS (EDU2012-31804), financiado parcialmente
por el Ministerio de Economía y Competitividad.

## Licencia

El juego se distribuye bajo la licencia
[Creative Commons Reconocimiento-CompartirIgual 3.0 Unported](https://creativecommons.org/licenses/by-sa/3.0/deed.es),
como figura en sus créditos. El código del motor de la versión web (`jugar/js/`) es una
adaptación del motor eAdventure y se distribuye bajo GNU LGPL 3.0. Detalles y textos
completos en [`LICENSE.md`](LICENSE.md).

## Cómo citar

Gómez Ruiz, M. Á., Rodríguez-Gómez, G., Ibarra-Sáiz, M. S., Caballero-Hernández, J. A. y Nieto Rojas, D. (2015). *EVONG. Evaluación en acción* [Juego educativo]. Zenodo. https://doi.org/10.5281/zenodo.24529824

Este DOI apunta siempre a la última versión archivada en Zenodo. La versión 1.0 tiene su
propio DOI: [10.5281/zenodo.24529825](https://doi.org/10.5281/zenodo.24529825).

Los datos para citarlo también están en [`CITATION.cff`](CITATION.cff) (botón «Cite this
repository» de GitHub).
