const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

let pool;
let dbReady = false;
let lastError = 'Sin intentos aún';

async function connectWithRetry() {
  let attempt = 0;
  while (!dbReady) {
    attempt++;
    try {
      console.log(`Intento ${attempt} - Conectando a MySQL...`);
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
      lastError = null;
      console.log('Tabla "mensajes" lista');
      return;
    } catch (err) {
      lastError = err.message;
      console.log(`Intento ${attempt} - Error: ${err.message}`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Endpoint de debug para ver estado de conexión
app.get('/debug', (req, res) => {
  res.json({
    dbReady,
    lastError,
    env: {
      MYSQL_URL: process.env.MYSQL_URL ? '✅ ' + process.env.MYSQL_URL.substring(0, 30) + '...' : '❌ no definida',
      DATABASE_URL: process.env.DATABASE_URL ? '✅ definida' : '❌ no definida',
      MYSQLHOST: process.env.MYSQLHOST || '❌ no definida',
      MYSQLUSER: process.env.MYSQLUSER || '❌ no definida',
      MYSQLDATABASE: process.env.MYSQLDATABASE || '❌ no definida',
      MYSQLPORT: process.env.MYSQLPORT || '❌ no definida',
      PORT: process.env.PORT || '3000 (default)'
    }
  });
});

// Arrancar servidor PRIMERO (para que el healthcheck pase)
app.listen(PORT, () => {
  console.log(`Servidor en puerto ${PORT}`);
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
