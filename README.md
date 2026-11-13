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

## Historial, ajustes y estimación

- **Historial:** movimientos y pagos marcados como pagados, por mes o todo, con filtros, búsqueda y exportación a Excel (CSV). Los movimientos capturados se pueden editar o eliminar.
- **Ajustar un pago:** en Resumen, toca un pago fijo o de tarjeta para cambiar su monto solo en ese periodo.
- **Estimación:** proyecta tu saldo por quincena, semana o mes a partir de tu saldo de hoy, ingresos fijos, pagos fijos, pagos de tarjeta (por corte y fecha límite) y un gasto del día a día (promedio automático o estimado propio).

Los datos se guardan localmente en el dispositivo (usa el respaldo en Cuentas).
