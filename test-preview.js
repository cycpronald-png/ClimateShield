const { exec } = require('child_process');
const server = exec('npm run preview');
setTimeout(() => {
  server.kill();
}, 2000);
