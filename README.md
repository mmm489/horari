# Hi Cream Horari

App publica para que cada empleado consulte su horario mediante un enlace privado.

## Variables

- `HORARI_DATABASE_URL`: conexion Postgres/Neon con acceso de solo lectura al dashboard.
- Tambien acepta `DASHBOARD_DATABASE_URL` o `POSTGRES_URL` como fallback.

## Rutas

- `/{token}`: horario del empleado.
- `/mi-horario/{token}`: compatibilidad con enlaces antiguos.

La app no tiene login, no muestra el dashboard y no permite modificar datos.
