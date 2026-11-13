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

Los datos se guardan localmente en el dispositivo.
