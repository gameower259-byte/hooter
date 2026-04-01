const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, './')));

const rooms = {};

io.on('connection', (socket) => {
    // ODA KURMA (Sınırsız soru listesi gelir)
    socket.on('createRoom', ({ username, questions }) => {
        const pin = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[pin] = {
            admin: socket.id,
            questions: questions,
            players: [],
            currentQuestionIndex: 0,
            status: 'waiting'
        };
        socket.join(pin);
        socket.emit('roomCreated', { pin });
    });

    socket.on('joinRoom', ({ pin, username }) => {
        if (rooms[pin]) {
            const player = { id: socket.id, name: username, score: 0 };
            rooms[pin].players.push(player);
            socket.join(pin);
            socket.emit('joinedSuccessfully', { pin });
            io.to(pin).emit('playerUpdate', rooms[pin].players);
        } else {
            socket.emit('error', 'Oda bulunamadı!');
        }
    });

    socket.on('startGame', (pin) => {
        if (rooms[pin] && rooms[pin].admin === socket.id) {
            sendQuestion(pin);
        }
    });

    function sendQuestion(pin) {
        const room = rooms[pin];
        const qIndex = room.currentQuestionIndex;
        if (qIndex < room.questions.length) {
            const q = room.questions[qIndex];
            // Oyunculara şıklarıyla beraber gönderiyoruz (Doğru cevap hariç)
            io.to(pin).emit('nextQuestion', {
                q: q.q, a: q.a, b: q.b, c: q.c, d: q.d,
                index: qIndex + 1,
                total: room.questions.length
            });
        } else {
            io.to(pin).emit('gameOver', 'Yarışma Bitti!');
        }
    }
    
    // Cevap kontrolü ve sonraki soruya geçiş buraya eklenebilir
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sunucu ${PORT} portunda.`));                    
