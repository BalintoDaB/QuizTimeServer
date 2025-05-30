import express, { Request, Response } from 'express';
import mysql from 'mysql2';
import cors from 'cors';
import Server from './server';

const app = express();
const PORT = 3001;

app.use(cors());
express.urlencoded({ extended: true });
app.use(express.json());

import WebSocket, { WebSocketServer } from 'ws';
const wss = new WebSocketServer({ port: 3002 });

let servers: Server[] = [];

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

//#region WebSocket Server
wss.on('connection', (ws: WebSocket) => {

  ws.on('message', (message: string) => {
    let data = JSON.parse(message);
    console.log('Received message:', data);
    switch (data.type) {
      case 'createServer':
        const newServer = new Server();
        newServer.serverId = servers.length + 1;
        newServer.hostId = data.hostId;
        newServer.quizId = data.quizId;
        newServer.timeLimit = data.timeLimit || 30; // Default to 30 seconds if not provided
        newServer.Setup(); // Load questions and answers from the database
        newServer.saveServerToDatabase();
        servers.push(newServer);
        ws.send(JSON.stringify({ type: 'serverCreated', serverId: newServer.serverId }));
        console.log(`New server created with ID: ${newServer.serverId}`);
        break;

      case 'joinServer':
        const server = servers.find(s => s.serverId === data.serverId);
        if (server) {
          server.addPlayer(data.playerId);
          ws.send(JSON.stringify({ type: 'joinedServer', serverId: server.serverId, playerList: server.playerList }));
          console.log(`Player ${data.playerId} joined server ${server.serverId}`);
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'Server not found' }));
        }
        break;

      case 'nextQuestion':
        const currentServer = servers.find(s => s.serverId === data.serverId);
        if (currentServer) {
          currentServer.nextQuestion();
          ws.send(JSON.stringify({ type: 'nextQuestion', questionIndex: currentServer.currentQuestion }));
          console.log(`Next question for server ${currentServer.serverId}: ${currentServer.currentQuestion}`);
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'Server not found' }));
        }
        break;

      case 'playerAnswer':
        const answerServer = servers.find(s => s.serverId === data.serverId);
        if (answerServer) {
          answerServer.playerAnswer(data.playerId, data.answer);
          ws.send(JSON.stringify({ type: 'answerReceived', playerId: data.playerId, answer: data.answer }));
          console.log(`Player ${data.playerId} answered question ${answerServer.currentQuestion} with answer ${data.answer}`);
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'Server not found' }));
        }
        break;

      case 'curTime':
        const timeServer = servers.find(s => s.serverId === data.serverId);
        if (timeServer) {
          ws.send(JSON.stringify({ type: 'curTime', timeLeft: timeServer.timeLeft }));
          console.log(`Current time for server ${timeServer.serverId}: ${timeServer.timeLeft}`);
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'Server not found' }));
        }
        break;

      case 'startServer':
        const startServer = servers.find(s => s.serverId === data.serverId);
        if (startServer) {
          startServer.nextQuestion(); // Start the first question
          ws.send(JSON.stringify({ type: 'serverStarted', serverId: startServer.serverId }));
          console.log(`Server ${startServer.serverId} started`);
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'Server not found' }));
        }
        break;

      default:
        console.log('Unknown message type:', data.type);
    }
  });

});

//#endregion

//#region REST API Endpoints
//all
app.get('/api/data', (req, res) => {
  db.query('SELECT * FROM users', (err, results) => {
    if (err) return res.status(500).send(err);
    res.json(results);
  });
});
//login
app.post('/api/login', (req, res) => {
  console.log('Received login request:', req.body);
  const { username, password } = req.body;


  // Query to find the user
  const query = 'SELECT * FROM users WHERE username = ? AND password = ?';
  db.execute(query, [username, password], (err, results) => {
    if (err) {
      console.log('Error querying user:', err);
      return res.status(500).json({ message: 'Error querying user' });
    }

    if ((results as mysql.RowDataPacket[]).length === 0) {
      console.log('Invalid credentials');
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // User found, return user data
    const user = (results as mysql.RowDataPacket[])[0];
    console.log('User logged in successfully:', user);
    res.status(200).json({
      message: 'Login successful',
      userId: user.id,
      username: user.username,
      email: user.email,
    });
  });
});
//register
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
//quizzes of a user
app.get('/api/quizzes/:userId', (req, res) => {
  const userId = req.params.userId;
  console.log(`Fetching quizzes for user ID: ${userId}`);

  const query = 'SELECT * FROM quizzes WHERE ownerId = ?';
  db.execute(query, [userId], (err, results) => {
    if (err) {
      console.error('Error fetching quizzes:', err);
      return res.status(500).json({ message: 'Error fetching quizzes' });
    }

    res.json(results);
  });
});
//specific quiz
app.get('/api/quiz/:quizId', async (req, res) =>  {
  const quizId = req.params.quizId;
  console.log(`Fetching quiz with ID: ${quizId}`);

  let res1: mysql.RowDataPacket | null = null;
  let res2 = null;

  let query = 'SELECT * FROM quizzes WHERE id = ?';
  db.execute(query, [quizId], (err, results) => {
    if (err) {
      console.error('Error fetching quiz:', err);
      return res.status(500).json({ message: 'Error fetching quiz' });
    }

    if ((results as mysql.RowDataPacket[]).length === 0) {
      return res.status(404).json({ message: 'Quiz not found' });
    }
    console.log('Quiz fetched successfully:', results);

    res1 = (results as mysql.RowDataPacket[])[0];
    console.log('Quiz details:', res1);
  });
  query = 'SELECT * FROM questions WHERE quizId = ?';
  db.execute(query, [quizId], (err, results) => {
    if (err) {
      console.error('Error fetching questions:', err);
      return res.status(500).json({ message: 'Error fetching questions' });
    }

    res2 = results;
  });

  while (res1 === null || res2 === null) {
    await new Promise(resolve => setTimeout(resolve, 100)); // wait for 100ms
  }


  res.json({
    quiz: res1,
    questions: res2
  });
});
//create quiz with questions
app.post('/api/quizzes', (req, res) => {
  const { title, ownerId, questions } = req.body;
  console.log('Received quiz creation request:', req.body);
  //make a new quiz, get its ID, replace the quizId in questions, and insert them (questions: [{quizId: null,question: 'asd',correct: 1,ans1: 'asd',ans2: 'asd',ans3: 'asd',ans4: 'asd'}])
  const insertQuizQuery = 'INSERT INTO quizzes (title, ownerId) VALUES (?, ?)';
  db.execute(insertQuizQuery, [title, ownerId], (err, result: mysql.ResultSetHeader) => {
    if (err) {
      console.error('Error inserting quiz:', err);
      return res.status(500).json({ message: 'Error inserting quiz' });
    }

    const quizId = result.insertId;
    console.log(`Quiz created with ID: ${quizId}`);

    // Prepare questions for insertion
    const questionValues = questions.map((q: any) => [
      quizId,
      q.question,
      q.correct,
      q.ans1,
      q.ans2,
      q.ans3,
      q.ans4
    ]);

    const insertQuestionsQuery = 'INSERT INTO questions (quizId, question, correct, ans1, ans2, ans3, ans4) VALUES ?';
    db.query(insertQuestionsQuery, [questionValues], (err) => {
      if (err) {
        console.error('Error inserting questions:', err);
        return res.status(500).json({ message: 'Error inserting questions' });
      }

      res.status(201).json({ message: 'Quiz and questions created successfully', quizId });
    });
  });
  
});
//delete quiz
app.delete('/api/quizzes/:quizId', (req: express.Request<{ quizId: string }>, res: express.Response) => {
  const quizId: string = req.params.quizId;
  console.log(`Deleting quiz with ID: ${quizId}`);

  const query: string = 'DELETE FROM quizzes WHERE id = ?';
  db.execute(query, [quizId], (err: mysql.QueryError | null, result: mysql.ResultSetHeader) => {
    if (err) {
      console.error('Error deleting quiz:', err);
      return res.status(500).json({ message: 'Error deleting quiz' });
    }

    const affectedRows: number = result.affectedRows;
    if (affectedRows === 0) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    res.status(200).json({ message: 'Quiz deleted successfully' });
  });
});
//#endregion
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`WebSocket server running at ws://localhost:3002`);
});
