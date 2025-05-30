import mysql from 'mysql2';

export default class Server {
    //player list, current question, usersDone, usersAnswering, answers
    public serverId: number = 0;
    public quizId: number = 0;
    public playerList: number[] = [];
    public currentQuestion: number = -1;
    public usersDone: number[] = [];
    public usersAnswering: number[] = [];
    public answers: { question:number, playerId:number, answer:number }[] = [];
    public hostId: number = 0;
    public timeLeft: number = 0;
    public timeLimit: number = 30; // Default time limit for each question in seconds
    public questionList: string[] = []; // List of questions for the quiz
    public correctAnswers: number[] = []; // List of correct answers for the questions

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
        const query = 'SELECT question, correct FROM questions WHERE quizId = ?';
        this.db.query(query, [this.quizId], (err, results: any[]) => {
            if (err) {
                console.error('Error fetching questions from database:', err);
                return;
            }
            this.questionList = results.map((row: any) => row.question);
            this.correctAnswers = results.map((row: any) => row.correct);
            console.log(`Loaded ${this.questionList.length} questions for quiz ID ${this.quizId}`);
        });
    }
    
    public addPlayer(playerId: number): void {
        if (!this.playerList.includes(playerId)) {
            this.playerList.push(playerId);
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
        if (this.currentQuestion < this.questionList.length) {
            // Notify players about the new question
            console.log(`Next question: ${this.questionList[this.currentQuestion]}`);
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
        if (this.usersAnswering.includes(playerId)) {
            this.answers.push({ question: this.currentQuestion, playerId, answer });
            const index = this.usersAnswering.indexOf(playerId);
            if (index !== -1) {
                this.usersAnswering.splice(index, 1);
            }
            this.usersDone.push(playerId);
        }
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
}