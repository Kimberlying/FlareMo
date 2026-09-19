# FlareMo 🔥

<p align="center">
  <b>Cero Servidores · Cero Costes de Mantenimiento · Disponibilidad Global 24/7 en el Edge · Control Absoluto de tus Datos</b><br>
  Para personas: un espacio íntimo de captura de ideas y segundo cerebro con IA. Para equipos: una base de conocimiento compartida con roles detallados.
</p>

<p align="center">
  <a href="./README.md">English</a> •
  <a href="./README.zh-CN.md">简体中文</a> •
  <a href="./README.ja.md">日本語</a> •
  <a href="./README.fr.md">Français</a> •
  <a href="./README.es.md"><b>Español</b></a> •
  <a href="./README.ko.md">한국어</a> •
  <a href="./README.ru.md">Русский</a> •
  <a href="./README.ar.md">العربية</a>
</p>

<p align="center">
  <a href="https://github.com/realchendahuang/FlareMo/stargazers"><img src="https://img.shields.io/github/stars/realchendahuang/FlareMo?style=flat&color=F38020" alt="GitHub stars"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/realchendahuang/FlareMo?style=flat&color=2563EB" alt="License"></a>
  <a href="https://workers.cloudflare.com/"><img src="https://img.shields.io/badge/Runtime-Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white" alt="Cloudflare Workers"></a>
  <a href="https://github.com/usememos/memos"><img src="https://img.shields.io/badge/Ecosystem-Memos%20Compatible-0284C7" alt="Memos Compatible"></a>
  <a href="https://www.better-auth.com/"><img src="https://img.shields.io/badge/Auth-Better%20Auth-10B981" alt="Better Auth"></a>
  <a href="https://flaremo.app"><img src="https://img.shields.io/badge/Sitio%20Web-flaremo.app-EA580C" alt="Website"></a>
</p>

<div align="center">

| ☀️ Escritorio · Modo Claro | 🌙 Escritorio · Modo Oscuro | 📱 Móvil · Adaptable |
| :---: | :---: | :---: |
| <img src="./docs/assets/flaremo-desktop-light.png" width="360" alt="Interfaz de escritorio de FlareMo en modo claro" /> | <img src="./docs/assets/flaremo-desktop-dark.png" width="360" alt="Interfaz de escritorio de FlareMo en modo oscuro" /> | <img src="./docs/assets/flaremo-mobile.png" width="168" alt="Interfaz móvil de FlareMo" /> |

<sub>Capturas reales de la aplicación: alternancia fluida entre temas claro y oscuro y diseño móvil completamente adaptable. Cada funcionalidad mostrada está conectada al backend.</sub>

</div>

---

## 💡 ¿Por qué elegir FlareMo?

Herramientas como Flomo y Memos han demostrado el inmenso valor de registrar notas sin fricción en una línea de tiempo limpia. Sin embargo, autohospedar estos sistemas suele requerir pagar un VPS mensualmente, configurar contenedores Docker, bases de datos PostgreSQL, mantener scripts de respaldo y temer la avería de un disco duro.

FlareMo responde a una pregunta distinta: **¿Es posible tener una base de conocimiento en línea las 24 horas, resiliente, con aceleración global y sin mantenimiento de servidores, usando solo una cuenta gratuita de Cloudflare?**

La respuesta es rotundamente sí:

- **Auténtico Serverless**: El código y los archivos estáticos se ejecutan en los más de 300 puntos de presencia perimetrales (edge) de Cloudflare, con respuesta en milisegundos.
- **Almacenamiento empresarial integrado**: Cloudflare D1 almacena notas y metadatos; Cloudflare R2 aloja archivos adjuntos con replicación multirregional.
- **Diseño nativo para IA**: Protocolo MCP y centro de memoria a largo plazo «Agent Memory», permitiendo que agentes como Claude, Cursor o ChatGPT lean y actualicen tu contexto.
- **Privacidad individual y colaboración en equipo**: Espacio personal privado por defecto, transformable al instante en un área de trabajo compartida con roles y tres niveles de visibilidad.
- **Mínimo, no simplificado**: interfaz serena y capacidad completa — nada de decoración estridente, ninguna función ausente.

---

## ✨ Características Principales

### 1. Captura instantánea y revisión enriquecedora
- **Escribe sin esperas**: Flujo cronológico en tarjetas, etiquetas múltiples, renderizado Markdown/GFM y vista previa de imágenes y audios.
- **Búsqueda ultrarrápida**: Motor de texto completo SQLite FTS5 con operadores avanzados (`has:attachment`, `is:pinned`, `before:YYYY-MM-DD`, etc.).
- **Búsqueda semántica vectorial**: Integración con Workers AI y Vectorize para encontrar notas por intención y contexto, con degradación elegante a FTS5.
- **Reactivación de ideas**: **Revisión diaria** (un día como hoy), **Paseo aleatorio** (navegación por grafos de etiquetas) y sugerencias de notas relacionadas.
- **Historial de versiones**: Comparación visual de cambios y restauración con un solo clic.

### 2. Memoria IA a largo plazo y MCP
- **Agent Memory**: A través del endpoint `/memory/mcp`, los agentes de IA registran y actualizan memoria persistente (preferencias, decisiones, restricciones).
- **Supervisión humana**: En la página `/memory` puedes auditar, fijar o corregir las memorias registradas por la IA.
- **Ecosistema abierto**: Endpoint Streamable HTTP MCP (`/mcp`) para consultar o añadir notas mediante código.

### 3. Proyectos y tareas
- **Agrupa el trabajo por proyectos**: Organiza notas y pendientes en proyectos, con tablero kanban (arrastrar entre columnas de estado), prioridades, orden manual y fechas límite.
- **Privado por diseño, borrado reversible**: Las tareas pertenecen a un solo propietario; al eliminarlas van a la papelera, donde pueden restaurarse o purgarse automáticamente.

### 4. Calendario
- **Las tareas como única fuente del calendario**: La vista mensual de `/calendar` llena los días pasados con lo que escribiste y los venideros con lo que vence — arrastra para reprogramar, añade tareas con fecha y consulta la lista agenda.
- **Recordatorios de vencidos**: Las tareas atrasadas generan notificaciones dentro de la app, con Web Push opcional en el navegador.

### 5. Trabajo en equipo y permisos en 3 niveles
- **Roles claros**: `owner`, `admin` y `member`. Enlaces de activación de un solo uso para que cada miembro elija su contraseña.
- **3 niveles de visibilidad**:
  - 🔒 **Privado**: Solo visible para el autor.
  - 👥 **Equipo**: Lectura compartida con los miembros activos del equipo.
  - 🌐 **Público**: Enlaces públicos revocables con fecha de caducidad.
- **Salida segura**: Al retirar a un miembro, sus datos privados se eliminan físicamente mientras que el contenido de equipo se preserva.
- **Plazas de lector**: Concede un asiento de solo lectura con caducidad — lectores invitados, alumnos, entregas a clientes. Expira automáticamente (fail-closed al resolver la credencial, sin cron). Géstionalas desde la página de miembros o aprovisiónalas por email mediante `PUT /api/app/admin/team/reader` con un token de acceso personal (ver `docs/team-mode.md`).

### 6. Modo sin conexión y experiencia PWA
- **PWA instalable**: Instala FlareMo en tu ordenador o móvil con tacto y velocidad de app nativa.
- **Sincronización garantizada**: Los borradores se guardan al instante en local; las notas creadas sin conexión se envían en orden al recuperar la red.
- **Captura de voz en vivo**: Página `/capture` con transcripción de voz a texto en tiempo real (ASR).

### 7. Seguridad robusta con Better Auth
- **Sesiones seguras**: Cookies `HttpOnly` y `SameSite=Lax` en navegadores; tokens de acceso personal (`memos_pat_`) revocables para scripts y MCP.
- **Protección estricta de Origin**: Validación rigurosa en todas las peticiones con cambio de estado.

### 8. Compatibilidad con el ecosistema Memos
- **API Memos compatible**: Endpoints `/api/v1/*` compatibles y esquema OpenAPI.
- **Soporte de apps de terceros**: Conexión directa con clientes como Moe Memos.
- **Importación y exportación**: Migración en un clic de paquetes Memos y flomo con resolución de conflictos.

---

### 9. Sistema de complementos: las tarjetas son complementos
- **Cinco tarjetas incluidas**: Sencilla, Diaria, Billete, Postal y un Matasellos dibujado con canvas.
- **Tienda y gestión**: en los ajustes — explorar directorios, instalación en un clic (verificación SHA-256), activar/desactivar, orden, tarjeta predeterminada, ocultar. El directorio oficial: [flaremo.app/plugins](https://flaremo.app/plugins/registry.json).
- **Sube los tuyos**: un administrador puede instalar un paquete local — solo existe en esa instancia y nunca se envía a ningún sitio.
- **Herramientas de autor**: `pnpm plugin:new` genera el esqueleto, `pnpm plugin:check` valida con **exactamente las reglas que se aplican al instalar**, `pnpm plugins:build` empaqueta. Las tarjetas document son maquetación JSON pura; las sandbox ejecutan tu propio HTML/CSS/JS. Ver la [guía de complementos](./docs/plugins.md).
- **Seguro por defecto**: las tarjetas se ejecutan en un sandbox de origen opaco y **sin acceso a la red**; los paquetes de comunidad y de marca permanecen desactivados hasta que un administrador los active.

## 📊 ¿Cuánto rinde el plan gratuito de Cloudflare?

| Recurso | Cuota Gratuita | Capacidad Estimada | Tiempo de uso práctico |
| :--- | :--- | :--- | :--- |
| **Cloudflare D1** | **5 GB de base de datos** | Aprox. **2,5 millones** de notas | Escribiendo 100 notas al día: **68 años** |
| **Cloudflare R2** | **10 GB de almacenamiento** | Aprox. **5.000–10.000 fotos** / **80 h** de voz | **0 $ de coste de transferencia de salida** |
| **Cloudflare Workers** | Generosa cuota de peticiones | Red global de más de 300 ubicaciones | Latencia de milisegundos sin arranques en frío |

---

## 🚀 Despliegue rápido en 5 minutos

### Método 1: Despliegue con un Agente IA (Recomendado)

Proporciona este repositorio a un agente capaz de ejecutar comandos (Claude Code, Cursor Agent, Codex) con el archivo [docs/agent-deploy.md](./docs/agent-deploy.md):
> «Por favor, despliega FlareMo en mi cuenta de Cloudflare siguiendo docs/agent-deploy.md».

---

### Método 2: Despliegue manual en 3 pasos

#### 1. Crear recursos
```bash
pnpm exec wrangler whoami
pnpm exec wrangler d1 create flaremo
pnpm exec wrangler r2 bucket create flaremo-attachments
```

#### 2. Configuración y secretos
```bash
cp wrangler.jsonc.example wrangler.jsonc
# Edita database_id y FLAREMO_PUBLIC_URL en wrangler.jsonc
pnpm exec wrangler secret put BETTER_AUTH_SECRET --config ./wrangler.jsonc
pnpm exec wrangler secret put FLAREMO_BOOTSTRAP_SECRET --config ./wrangler.jsonc
```

#### 3. Desplegar
```bash
pnpm deploy:dry-run
pnpm deploy
```
(El gate completo `pnpm verify` solo se ejecuta cuando el mantenedor lo solicita explícitamente.)
Abre `/setup` en tu dominio para inicializar tu cuenta de Propietario con el secreto de bootstrap.

---

## 📄 Licencia

Publicado bajo licencia de código abierto [GNU AGPL-3.0](./LICENSE).
Copyright (c) 2026 realchendahuang.
