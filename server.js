const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);

// Güvenlik katmanları
app.use(helmet());
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: "Çok fazla istek! Lütfen dinlen."
});
app.use(limiter);

const io = new Server(server, {
    cors: { origin: "*" }
});

// Oyun Verileri (Bellekte tutulur, sunucu kapanınca sıfırlanır)
const rooms = {};

io.on('connection', (socket) => {
    // ODA KURMA
    socket.on('createRoom', ({ username, questions }) => {
        const pin = Math.floor(1000 + Math.random() * 9000).toString(); // 4 haneli PIN
        rooms[pin] = {
            admin: socket.id,
            adminName: username,
            questions: questions, // [{q, a, b, c, d, correct}, ...]
            players: [],
            currentQuestion: 0,
            status: 'waiting'
        };
        socket.join(pin);
        socket.emit('roomCreated', { pin });
    });

    // ODAYA KATILMA
    socket.on('joinRoom', ({ pin, username }) => {
        if (rooms[pin]) {
            const player = { id: socket.id, name: username, score: 0 };
            rooms[pin].players.push(player);
            socket.join(pin);
            io.to(pin).emit('playerUpdate', rooms[pin].players);
            socket.emit('joinedSuccessfully', { pin });
        } else {
            socket.emit('error', 'Oda bulunamadı!');
        }
    });

    // OYUNU BAŞLATMA (Sadece Admin)
    socket.on('startGame', (pin) => {
        if (rooms[pin] && rooms[pin].admin === socket.id) {
            rooms[pin].status = 'playing';
            const firstQuestion = rooms[pin].questions[0];
            // Doğru cevabı gizleyerek gönder
            const secureQuestion = { ...firstQuestion };
            delete secureQuestion.correct;
            io.to(pin).emit('nextQuestion', secureQuestion);
        }
    });

    socket.on('disconnect', () => {
        console.log('Bir kullanıcı ayrıldı');
    });
});

app.get('/', (req, res) => res.send('Hooter API Aktif!'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Port: ${PORT}`));
