const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit'); // Bot koruması için
const helmet = require('helmet'); // Temel güvenlik başlıkları için

const app = express();
const server = http.createServer(app);

// 1. GÜVENLİK: Temel HTTP başlıklarını koruma altına al
app.use(helmet());

// 2. BOT KORUMASI: Aynı IP'den çok fazla istek gelmesini engelle
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 dakika
    max: 100, // Her IP için maksimum 100 istek
    message: "Çok fazla istek gönderdin, lütfen biraz bekle."
});
app.use(limiter);

const io = new Server(server, {
    cors: {
        origin: "*", // Gerçek projede buraya sadece kendi site adresini yazmalısın
        methods: ["GET", "POST"]
    }
});

// Oyun verilerini bellekte tutuyoruz (Şimdilik SQL kullanmadan)
let rooms = {};

io.on('connection', (socket) => {
    console.log('Yeni bağlantı:', socket.id);

    // Odaya katılma ve basit doğrulama
    socket.on('joinRoom', ({ pin, username }) => {
        // SQL Koruması: Inputları temizle ve direkt sorguya sokma
        const cleanPin = String(pin).trim();
        const cleanUsername = String(username).substring(0, 15); // İsim uzunluğunu sınırla

        if (cleanPin === "1234") { // Örnek PIN
            socket.join(cleanPin);
            console.log(`${cleanUsername} odaya katıldı: ${cleanPin}`);
            
            // Odaya katılanı diğerlerine bildir
            io.to(cleanPin).emit('userJoined', cleanUsername);
        } else {
            socket.emit('error', 'Geçersiz PIN!');
        }
    });

    socket.on('disconnect', () => {
        console.log('Kullanıcı ayrıldı:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});
