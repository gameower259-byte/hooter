const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);

// 1. GÜVENLİK AYARLARI
// Helmet, Socket.io ile bazen çakışabildiği için Content Security Policy'yi hafifletiyoruz
app.use(helmet({
    contentSecurityPolicy: false,
}));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: "Çok fazla istek gönderildi, lütfen bekleyin."
});
app.use(limiter);

// 2. STATİK DOSYALARI DIŞARI AÇMA
// Bu satır, klasördeki index.html, css veya resim dosyalarını tarayıcıya gönderir
app.use(express.static(path.join(__dirname, './')));

const io = new Server(server, {
    cors: { origin: "*" }
});

// 3. OYUN VERİLERİ (RAM üzerinde tutulur)
const rooms = {};

io.on('connection', (socket) => {
    console.log('Kullanıcı bağlandı:', socket.id);

    // ODA KURMA
    socket.on('createRoom', ({ username, questions }) => {
        const pin = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[pin] = {
            admin: socket.id,
            adminName: username,
            questions: questions,
            players: [],
            currentQuestion: 0,
            status: 'waiting'
        };
        socket.join(pin);
        socket.emit('roomCreated', { pin });
        console.log(`Oda kuruldu: ${pin} (Admin: ${username})`);
    });

    // ODAYA KATILMA
    socket.on('joinRoom', ({ pin, username }) => {
        if (rooms[pin]) {
            const player = { id: socket.id, name: username, score: 0 };
            rooms[pin].players.push(player);
            socket.join(pin);
            
            // Odadaki herkese yeni oyuncuyu bildir
            io.to(pin).emit('playerUpdate', rooms[pin].players);
            socket.emit('joinedSuccessfully', { pin });
            console.log(`${username}, ${pin} nolu odaya girdi.`);
        } else {
            socket.emit('error', 'Oda bulunamadı! PIN kontrol et.');
        }
    });

    // OYUNU BAŞLATMA
    socket.on('startGame', (pin) => {
        if (rooms[pin] && rooms[pin].admin === socket.id) {
            rooms[pin].status = 'playing';
            const question = rooms[pin].questions[0];
            io.to(pin).emit('nextQuestion', {
                q: question.q,
                a: question.a,
                b: question.b,
                c: question.c,
                d: question.d
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('Kullanıcı ayrıldı.');
    });
});

// 4. ANA SAYFAYI GÖSTERME
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda canavar gibi çalışıyor.`);
});
