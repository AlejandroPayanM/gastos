# Mis Gastos

App móvil (Expo / React Native) para llevar entradas, salidas, imprevistos y pagos fijos, por **quincena, semana o mes**, con cuentas de débito y tarjetas de crédito con corte y fecha límite.

## Correr

```bash
npm install
npx expo start        # escanea el QR con Expo Go (Android / iOS)
npm run web           # o ábrela en el navegador
npm test              # pruebas de la lógica (periodos, recurrencia, cortes)
```

## Cómo calcula las tarjetas

- Cada tarjeta tiene **día de corte** y **día límite de pago**.
- Las compras hasta el día de corte forman un estado de cuenta; su pago cae en la primera fecha límite posterior al corte.
- Ese pago aparece solo en la quincena/semana/mes donde vence y entra al desglose de totales.
- Compras a meses o un saldo que ya traías: se registran como "plan" dentro de la tarjeta y se suman al pago del mes que corresponde.
- Un pago fijo con tarjeta de crédito se suma al estado de cuenta en vez de restar de tu débito.

## Fines de semana

Los pagos e ingresos fijos mensuales y quincenales pueden moverse solos cuando su fecha cae en sábado o domingo: adelantar al viernes (por defecto en los quincenales, como el sueldo del 15 y del 30/31), pasar al lunes, o dejarlo igual. El formulario muestra las próximas fechas ya ajustadas. No considera días festivos.

## Cada 2 semanas

Un pago fijo puede repetirse **cada 14 días** (por ejemplo, un viernes sí y otro no) con la frecuencia "Cada 2 sem.": eliges la fecha exacta del primer pago y los demás caen cada 2 semanas desde ahí, aunque algunos meses tengan 3. Si un viernes no se hace el pago, se ajusta solo ese periodo desde el Resumen.

## Quincena de paga a paga

Si tienes un ingreso fijo quincenal (tu sueldo), la "quincena" de la app va de una paga a la siguiente: empieza el día que cobras y termina el día antes del siguiente cobro (por ejemplo del 30 oct al 12 nov y del 13 al 29 nov). Así lo que cobras el 13 cubre también los pagos de tarjeta que vencen el 16/17. Sin ingreso fijo quincenal se usan quincenas de calendario (1–15 y 16–fin). Mes y semana siguen siendo de calendario. En el ingreso fijo puedes elegir si define o no tu quincena.

## Historial, ajustes y estimación

- **Historial:** movimientos y pagos marcados como pagados, por mes o todo, con filtros, búsqueda y exportación a Excel (CSV). Los movimientos capturados se pueden editar o eliminar.
- **Ajustar un pago:** en Resumen, toca un pago fijo o de tarjeta para cambiar su monto solo en ese periodo.
- **Estimación:** proyecta tu saldo por quincena, semana o mes a partir de tu saldo de hoy, ingresos fijos, pagos fijos, pagos de tarjeta (por corte y fecha límite) y un gasto del día a día (promedio automático o estimado propio).

Los datos se guardan primero en el dispositivo (usa también el respaldo en Cuentas). Opcionalmente se pueden sincronizar con una cuenta en la nube (ver abajo).

## Cuenta en la nube (Supabase)

Con una cuenta, tus datos se guardan en una base de datos (Postgres en Supabase) y se ven iguales en cualquier dispositivo. La app sigue funcionando sin internet: guarda en el dispositivo y sube los cambios en cuanto puede. Si no se configura, la app funciona solo en local como antes.

**Cómo funciona:** cada usuario tiene una fila en la tabla `user_data` con todos sus datos en JSON y un número de versión. Si dos dispositivos cambian cosas a la vez, no se pisan: se unen por id y gana lo del dispositivo que guarda. Las reglas de seguridad (RLS) hacen que cada quien solo vea su propia fila.

**Configuración (una vez):**

1. Crea un proyecto gratuito en [supabase.com](https://supabase.com).
2. En **SQL Editor** pega y ejecuta [supabase/schema.sql](supabase/schema.sql).
3. En **Project Settings → API** copia la *Project URL* y la clave pública (*anon* o *publishable*). Nunca uses la clave `service_role`.
4. En **Authentication → Sign In / Providers → Email**, para uso personal puedes desactivar "Confirm email". Si la dejas activa, el correo de confirmación necesita que en **Authentication → URL Configuration** pongas como *Site URL* el enlace de tu app (por ejemplo `https://appgastoss.netlify.app`).
5. En **Netlify → Site configuration → Environment variables** agrega `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` con esos valores y haz un nuevo deploy (*Deploys → Trigger deploy → Clear cache and deploy site*). Para probar en tu PC copia `.env.example` a `.env.local` con los mismos datos.
6. En la app: **Cuentas → Cuenta en la nube → Crear cuenta**. Lo que ya tengas en el dispositivo se sube solo.

**Ten en cuenta:** los datos no van cifrados de extremo a extremo (el dueño del proyecto y Supabase pueden verlos en la base). Los proyectos gratuitos de Supabase se pausan tras una semana sin actividad; no se pierden datos, solo hay que reactivarlos desde su panel. Si borras algo en un dispositivo mientras otro tiene cambios sin sincronizar, lo borrado puede reaparecer al unirse.
