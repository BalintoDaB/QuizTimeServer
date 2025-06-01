import mysql from 'mysql2';

export default class Server {
    //player list, current question, usersDone, usersAnswering, answers
    public serverId: number = 0;
    public quizId: number = 0;
    public quizName: string = '';
    public playerList: number[] = [];
    public playerNames: string[] = [];
    public currentQuestion: number = -1;
    public usersDone: number[] = [];
    public usersAnswering: number[] = [];
    public answers: { question:number, playerId:number, answer:number }[] = [];
    public hostId: number = 0;
    public hostName: string = '';
    public timeLeft: number = 0;
    public timeLimit: number = 30; // Default time limit for each question in seconds
    // public questionList: string[] = []; // List of questions for the quiz
    // public correctAnswers: number[] = []; // List of correct answers for the questions
    //list of question, which has question text, ans1, ans2, ans3, an4, correct answer
    public questionData: { question: string, ans1: string, ans2: string, ans3: string, ans4: string, correct: number }[] = [];

    private db: mysql.Connection;

    constructor() {
        this.db = mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: '',
            database: 'quiztime'
        });

        this.db.connect();
    }

    public Setup(){
        //get questions and answers from the database
        let query = 'SELECT question, ans1, ans2, ans3, ans4, correct FROM questions WHERE quizId = ?';
        this.db.query(query, [this.quizId], (err, results: any[]) => {
            if (err) {
                console.error('Error fetching questions from database:', err);
                return;
            }
            this.questionData = results.map(row => ({
                question: row.question,
                ans1: row.ans1,
                ans2: row.ans2,
                ans3: row.ans3,
                ans4: row.ans4,
                correct: row.correct
            }));
            console.log(`Loaded ${this.questionData.length} questions for quiz ID ${this.quizId}`);
        });
        query = "SELECT username FROM users WHERE id = ?";
        this.db.query(query, [this.hostId], (err, results: any[]) => {
            if (err) {
                console.error('Error fetching host username from database:', err);
                return;
            }
            if (results.length > 0) {
                this.hostName = results[0].username;
                console.log(`Host username set to ${this.hostName}`);
            } else {
                console.warn('Host ID not found in users table.');
            }
        });
        query = "SELECT title FROM quizzes WHERE id = ?";
        this.db.query(query, [this.quizId], (err, results: any[]) => {
            if (err) {
                console.error('Error fetching quiz title from database:', err);
                return;
            }
            if (results.length > 0) {
                this.quizName = results[0].title;
                console.log(`Quiz name set to ${this.quizName}`);
            } else {
                console.warn('Quiz ID not found in quizzes table.');
            }
        });
    }
    
    public async addPlayer(playerId: number) {
        if (!this.playerList.includes(playerId)) {
            this.playerList.push(playerId);
            let query = "SELECT username FROM users WHERE id = ?";
            this.db.query(query, [playerId], (err, results: any[]) => {
                if (err) {
                    console.error('Error fetching player username from database:', err);
                    return;
                }
                if (results.length > 0) {
                    this.playerNames.push(results[0].username);
                    console.log(`Player ${results[0].username} added to the server.`);
                } else {
                    console.warn(`Player ID ${playerId} not found in users table.`);
                }
            });
        }
    }
    public removePlayer(playerId: number): void {
        const index = this.playerList.indexOf(playerId);
        if (index !== -1) {
            this.playerList.splice(index, 1);
        }
    }
    public nextQuestion(): void {
        this.currentQuestion++;
        this.usersDone = [];
        this.usersAnswering = this.playerList;
        this.timeLeft = this.timeLimit; // Reset time left for the new question
        if (this.currentQuestion < this.questionData.length) {
            // Notify players about the new question
            console.log(`Next question: ${this.questionData[this.currentQuestion]}`);
            this.startTimer(); // Start the timer for the current question
        } else {
            console.log('Quiz completed.');
            // Handle quiz completion logic here, e.g., calculate scores, notify players, etc.
        }
    }
    // Method to start the timer for the current question
    public startTimer(): void {
        const timerInterval = setInterval(() => {
            if (this.timeLeft > 0) {
                this.timeLeft--;
            } else {
                clearInterval(timerInterval);
                // Handle timeout logic here, e.g., mark all users as done
                this.usersAnswering.forEach(playerId => {
                    this.answers.push({ question: this.currentQuestion, playerId, answer: -1 }); // -1 for no answer
                    this.usersDone.push(playerId);
                });
                this.usersAnswering = [];
            }
        }, 1000); // Update every second
    }
    public playerAnswer(playerId: number, answer: number): void {
        this.answers.push({ question: this.currentQuestion, playerId, answer });
        const index = this.usersAnswering.indexOf(playerId);
        if (index !== -1) {
            this.usersAnswering.splice(index, 1);
        }
        this.usersDone.push(playerId);
    }

    public saveServerToDatabase(): void {
        // hosted_servers = 	id	hostId	hostedQuizId	joinedUserIds	ip_address	port	status	started_at	
        const query = 'INSERT INTO hosted_servers (hostId, hostedQuizId, joinedUserIds, status, started_at) VALUES (?, ?, ?, ?, NOW())';
        const joinedUserIds = JSON.stringify(this.playerList);
        this.db.query(query, [this.hostId, this.quizId, joinedUserIds, 'active'], (err) => {
            if (err) {
                console.error('Error saving server to database:', err);
            } else {
                console.log(`Server for quiz ID ${this.quizId} saved successfully.`);
            }
        });
    }

    public getCurrentQuestion(){
        if (this.currentQuestion >= 0 && this.currentQuestion < this.questionData.length) {
            return this.questionData[this.currentQuestion];
        } else {
            return null; // No current question
        }
    }

    //get results of the quiz, {playerName, correctAnswersNum}[]
    public getResults(): { playerName: string, correctAnswersNum: number }[] {
        let results: { playerName: string, correctAnswersNum: number }[] = [];
        let correctAnswers = this.questionData.map(q => q.correct);
        
        this.playerList.forEach(playerId => {
            let playerName = this.playerNames[this.playerList.indexOf(playerId)];
            results.push({
                playerName: playerName,
                correctAnswersNum: 0
            });
        });
        this.answers.forEach(answer => {
            if (answer.answer === correctAnswers[answer.question]) {
                let playerIndex = this.playerList.indexOf(answer.playerId);
                if (playerIndex !== -1) {
                    results[playerIndex].correctAnswersNum++;
                }
            }
        });
        // Sort results by correct answers in descending order
        results.sort((a, b) => b.correctAnswersNum - a.correctAnswersNum);

        return results;
    }
}