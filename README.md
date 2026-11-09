
Modificaciones realizadas para la solución del proyecto (Actividad 1) 

Por: Valerie Suarique y Daniel Torres

En esta sección detallamos el proceso que seguimos para corregir las inconsistencias de código y base de datos presentes en el repositorio inicial, logrando habilitar las funciones requeridas para la Actividad 1.

1. Corrección en la inicialización del esquema

Al intentar ejecutar el servidor por primera vez con el comando npm run dev, se generó un error de sintaxis (SyntaxError: Missing catch or finally after try). Al revisar el archivo Backend/database.js, identificamos que la función inicializarEsquema() venía incompleta de origen, con un bloque try abierto pero sin su respectivo cierre ni manejo de excepciones.
• Solución: Completamos la estructura de la función agregando el bloque catch para mitigar fallas, definimos la creación de las tablas base mediante sentencias CREATE TABLE IF NOT EXISTS e implementamos las directivas de optimización móvil requeridas en la guía.

2. Sincronización del registro de usuarios

Al probar el formulario de registro en la interfaz del navegador, el sistema arrojó un fallo de ejecución en SQLite. Inspeccionamos la ruta de autenticación en el archivo Backend/server.js y localizamos dos errores estructurales:
• Falta de instrucción SQL: La variable de la consulta carecía de la sentencia INSERT INTO usuarios, iniciando directamente con la declaración de los campos entre paréntesis. Procedimos a reescribir la consulta de inserción de forma correcta.
• Campos ausentes en el esquema: El servidor intentaba almacenar los valores de region, preferencias_json y fecha_registro. Sin embargo, estas columnas no formaban parte de la tabla usuarios en el diseño inicial. Modificamos la tabla en database.js para añadir estos tres campos y configuramos el registro de fecha automático mediante CURRENT_TIMESTAMP.

3. Emparejamiento de la tabla de capturas

Una vez dentro de la plataforma, el proceso de simular la captura de un Pokémon falló debido a discrepancias entre las propiedades enviadas por el backend y las columnas de la base de datos local:
• Inconsistencia de nombres (IDs): En el esquema inicial habíamos nombrado la columna como pokemon_id, mientras que la consulta en el servidor la solicitaba como poke_id. Modificamos el nombre en la tabla para que coincidieran.
• Columnas faltantes para la inserción: La consulta de inserción enviaba parámetros para el peso (peso_kg) y la marca de tiempo de la operación (fecha_captura), los cuales no existían en el modelo de base de datos. Los integramos en la definición de la tabla capturas dentro de database.js usando los tipos de datos adecuados.

4. Limpieza del entorno y validación de comandos

Para remover los datos de prueba previos del repositorio y asegurar un entorno de evaluación limpio, eliminamos directamente el archivo físico pokedex.db (junto con sus archivos temporales) desde el explorador. Al reiniciarse, el servidor detectó la ausencia del archivo y generó la estructura corregida desde cero.
Finalmente, validamos el comportamiento del sistema mediante los comandos interactivos de la terminal:
• pragma: Confirmó la correcta activación de las claves foráneas y el modo de diario wal.
• tablas: Permitió visualizar la inserción correcta de nuestros registros en vivo.
• plan: Verificó que el índice B-Tree creado (idx_capturas_usuario_activo) es utilizado de forma eficiente por el motor de SQLite para optimizar las consultas.
