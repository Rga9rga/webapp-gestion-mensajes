const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

let pool;
let dbReady = false;

async function connectWithRetry() {
  const maxRetries = 10;
  for (let i = 1; i <= maxRetries; i++) {
    try {
      const dbUrl = process.env.MYSQL_URL || process.env.DATABASE_URL;

      if (dbUrl) {
        console.log('Conectando con MYSQL_URL...');
        pool = mysql.createPool(dbUrl);
      } else {
        console.log('Conectando con variables individuales...');
        console.log('MYSQLHOST:', process.env.MYSQLHOST || '(no definida)');
        pool = mysql.createPool({
          host: process.env.MYSQLHOST,
          user: process.env.MYSQLUSER,
          password: process.env.MYSQLPASSWORD,
          database: process.env.MYSQLDATABASE,
          port: Number(process.env.MYSQLPORT || 3306),
          waitForConnections: true,
          connectionLimit: 10,
          queueLimit: 0
        });
      }

      const conn = await pool.getConnection();
      conn.release();
      console.log('Conectado a MySQL correctamente');

      await pool.query(`
        CREATE TABLE IF NOT EXISTS mensajes (
          id INT AUTO_INCREMENT PRIMARY KEY,
          nombre VARCHAR(50),
          mensaje TEXT,
          fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      dbReady = true;
      return;
    } catch (err) {
      console.log(`Intento ${i}/${maxRetries} - Error conectando a MySQL:`, err.message);
      if (i < maxRetries) {
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }
  console.error('No se pudo conectar a MySQL tras varios intentos');
}

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Arrancar servidor PRIMERO (para que el healthcheck pase)
app.listen(PORT, () => {
  console.log(`Servidor en puerto ${PORT}`);
  // Luego conectar a MySQL en segundo plano
  connectWithRetry();
});

app.post('/enviar', async (req, res) => {
  if (!dbReady) return res.status(503).send('Base de datos no disponible todavía. Inténtalo en unos segundos.');
  const { nombre, mensaje } = req.body;
  if (!nombre || !mensaje) {
    return res.status(400).send('Faltan campos obligatorios.');
  }

  try {
    await pool.query(
      'INSERT INTO mensajes (nombre, mensaje) VALUES (?, ?)',
      [nombre, mensaje]
    );
    res.redirect('/mensajes.html');
  } catch (err) {
    console.error('Error al insertar:', err);
    res.status(500).send('Error al guardar el mensaje.');
  }
});

app.get('/mensajes', async (req, res) => {
  if (!dbReady) return res.status(503).send('Base de datos no disponible todavía. Inténtalo en unos segundos.');
  try {
    const [results] = await pool.query(
      'SELECT * FROM mensajes ORDER BY fecha DESC'
    );

    let html = '<h1>📬 Mensajes recibidos</h1><a href="/">Volver</a><hr>';
    results.forEach(m => {
      html += `<p><b>${m.nombre}</b>: ${m.mensaje}<br><small>${m.fecha}</small></p><hr>`;
    });

    res.send(html);
  } catch (err) {
    console.error('Error al recuperar mensajes:', err);
    res.status(500).send('Error al recuperar mensajes.');
  }
});
