const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, './')));

const rooms = {};

// XSS Koruması için basit bir temizleyici
const escapeHTML = (str) => str.toString().replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m]));

io.on('connection', (socket) => {
    socket.on('createRoom', ({ username, questions }) => {
        // Validation: Boş soruları filtrele
        const validQuestions = questions.filter(q => q.q && q.a && q.b && q.c && q.d && q.correct);
        if (validQuestions.length === 0) return socket.emit('error', 'Geçerli soru bulunamadı!');

        let pin;
        do { pin = Math.floor(1000 + Math.random() * 9000).toString(); } while (rooms[pin]);

        rooms[pin] = {
            admin: socket.id,
            questions: validQuestions,
            players: [{ id: socket.id, name: escapeHTML(username), score: 0 }],
            currentQuestionIndex: 0,
            answers: {},
            status: 'waiting',
            timer: null,
            showingResult: false
        };

        socket.join(pin);
        socket.emit('roomCreated', { pin });
        io.to(pin).emit('playerUpdate', rooms[pin].players);
    });

    socket.on('joinRoom', ({ pin, username }) => {
        const room = rooms[pin];
        if (!room) return socket.emit('error', 'Oda bulunamadı!');
        if (room.status !== 'waiting') return socket.emit('error', 'Oyun başladı!');
        if (room.players.length >= 50) return socket.emit('error', 'Oda dolu! (Max 50)');

        const safeName = escapeHTML(username).substring(0, 15);
        room.players.push({ id: socket.id, name: safeName, score: 0 });
        socket.join(pin);
        socket.emit('joinedSuccessfully', { pin });
        io.to(pin).emit('playerUpdate', room.players);
    });

    socket.on('startGame', (pin) => {
        const room = rooms[pin];
        if (room && room.admin === socket.id && room.status === 'waiting') {
            room.status = 'playing';
            sendNextQuestion(pin);
        }
    });

    function sendNextQuestion(pin) {
        const room = rooms[pin];
        if (!room) return;

        room.answers = {}; 
        room.showingResult = false;
        const qIndex = room.currentQuestionIndex;
        
        if (qIndex < room.questions.length) {
            const q = room.questions[qIndex];
            io.to(pin).emit('nextQuestion', {
                q: q.q, a: q.a, b: q.b, c: q.c, d: q.d,
                index: qIndex + 1, total: room.questions.length
            });

            room.startTime = Date.now();
            clearTimeout(room.timer);
            room.timer = setTimeout(() => showResults(pin), 20000);
        } else {
            finishGame(pin);
        }
    }

    socket.on('submitAnswer', ({ pin, answer }) => {
        const room = rooms[pin];
        if (!room || room.status !== 'playing' || room.answers[socket.id] || room.showingResult) return;

        const q = room.questions[room.currentQuestionIndex];
        const isCorrect = answer === q.correct;
        let pts = 0;
        if (isCorrect) {
            const diff = (Date.now() - room.startTime) / 1000;
            pts = Math.max(500, Math.floor(1000 - (diff * 25)));
            const p = room.players.find(p => p.id === socket.id);
            if (p) p.score += pts;
        }

        room.answers[socket.id] = { answer, pts };
        if (Object.keys(room.answers).length === room.players.length) {
            showResults(pin);
        }
    });

    function showResults(pin) {
        const room = rooms[pin];
        if (!room || room.showingResult) return;
        room.showingResult = true;
        clearTimeout(room.timer);

        const correct = room.questions[room.currentQuestionIndex].correct;
        io.to(pin).emit('questionResult', { correct, players: room.players });
        
        room.currentQuestionIndex++;
        setTimeout(() => sendNextQuestion(pin), 4000);
    }

    function finishGame(pin) {
        const room = rooms[pin];
        if (!room) return;
        io.to(pin).emit('gameOver', room.players.sort((a,b) => b.score - a.score));
        delete rooms[pin];
    }

    socket.on('disconnect', () => {
        for (const pin in rooms) {
            const room = rooms[pin];
            if (room.admin === socket.id) {
                io.to(pin).emit('error', 'Admin ayrıldı, oyun bitti.');
                delete rooms[pin];
                continue;
            }
            room.players = room.players.filter(p => p.id !== socket.id);
            delete room.answers[socket.id];
            if (room.players.length === 0) delete rooms[pin];
            else {
                io.to(pin).emit('playerUpdate', room.players);
                if (room.status === 'playing' && Object.keys(room.answers).length === room.players.length) {
                    showResults(pin);
                }
            }
        }
    });
});

server.listen(process.env.PORT || 3000);
