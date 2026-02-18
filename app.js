const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

let pool;

async function createPool() {
  pool = mysql.createPool({
    host: process.env.MYSQLHOST,
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE,
    port: Number(process.env.MYSQLPORT),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  // Prueba de conexión
  const conn = await pool.getConnection();
  conn.release();
  console.log('Conectado a MySQL correctamente');
}

async function ensureDB() {
  // SOLO crear la tabla, NO la base de datos
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS mensajes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(50),
      mensaje TEXT,
      fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  await pool.query(createTableQuery);
}

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

(async () => {
  try {
    await createPool();
    await ensureDB();
    app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
  } catch (err) {
    console.error('Error al conectar con MySQL:', err);
    process.exit(1);
  }
})();

app.post('/enviar', async (req, res) => {
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
