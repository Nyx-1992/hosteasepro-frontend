const jwt = require('jsonwebtoken');

const secret = 'TiVnoPCrYFWA3o1GqSslmci63A+0+UdM9rUNH65s6a/qAt3NYXrCW88DuOkqF/ZGJi2tCoDE5VbXR6lkoEVOIQ==';
const payload = {
  sub: '9a323a45-16fc-4c86-abf8-5004e3af1849',
  email: 'sn_apt_management@outlook.com',
  role: 'admin'
};

const token = jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: '1h' });
console.log(token);
