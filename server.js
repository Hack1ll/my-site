const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Move single-digit route before static middleware so routes like '/5' don't 404
app.get('/:digit(\\d)', (req, res, next) => {
  const digit = req.params.digit;
  const indexPath = path.join(__dirname, 'public', 'index.html');

  // Prefer serving an index.html if it exists under /public, otherwise send a basic response
  res.sendFile(indexPath, (err) => {
    if (err) {
      // If file not found or other error, return a simple response rather than a 404 from static
      res.status(200).send(`Digit: ${digit}`);
    }
  });
});

// Serve static assets from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Fallback route (optional)
app.get('*', (req, res) => {
  res.status(404).send('Not Found');
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
