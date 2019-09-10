/* eslint-disable no-console */
const express = require('express');

const PORT = process.env.PORT || 8080;

const server = express();
server.use(express.static(__dirname));
server.listen(PORT, () => {
    console.log('=> 🙌 SERVER STARTED');
    console.log(`Go to http://localhost:${PORT}`);
    console.log('Press Ctrl + C to stop server');
});
