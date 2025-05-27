import express from 'express';
import mysql from 'mysql2';
import cors from 'cors';

const app = express();
const PORT = 3001;

app.use(cors());
express.urlencoded({ extended: true });
app.use(express.json());

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'quiztime'
});

db.connect(err => {
  if (err) {
    console.error('Error connecting to DB:', err);
    return;
  }
  console.log('Connected to MySQL');
});

app.get('/api/data', (req, res) => {
  db.query('SELECT * FROM users', (err, results) => {
    if (err) return res.status(500).send(err);
    res.json(results);
  });
});

app.post('/api/register', (req, res) => {
  console.log('Received registration request:', req.body);
  const { username, email, password } = req.body;

  // Input validation (basic check)
  if (!username || !email || !password) {
    console.log('Validation failed: All fields are required');
    res.status(400).json({ message: 'All fields are required' });
    return;
  }

  // Check if the user already exists
  const checkQuery = 'SELECT * FROM users WHERE email = ? OR username = ?';
  db.execute(checkQuery, [email, username], (err, results) => {
    if (err) {
      console.log('Error checking user:', err);
      return res.status(500).json({ message: 'Error checking user' });
    }

    if ((results as mysql.RowDataPacket[]).length > 0) {
      console.log('User already exists:', results);
      return res.status(409).json({ message: 'User already exists' });
    }

    // Insert the new user into the database
    const insertQuery = 'INSERT INTO users (username, email, password) VALUES (?, ?, ?)';
    db.execute(insertQuery, [username, email, password], (err, result: any) => {
      if (err) {
        console.log('Error inserting user:', err);
        return res.status(500).json({ message: 'Error inserting user' });
      }

      // Success response with the new user ID
      const insertId = (result as mysql.ResultSetHeader).insertId;
      res.status(201).json({
        message: 'User registered successfully',
        userId: insertId,
      });
    });
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});