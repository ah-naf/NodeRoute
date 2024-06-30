// utils.js
const path = require("path");
const fsStream = require("fs");

const mimeTypes = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".txt": "text/plain",
};

function serve404(res, custom404Path = null) {
  const filePath = custom404Path || path.join(__dirname, "public", "404.html");
  res.statusCode = 404;
  res.setHeader("Content-Type", "text/html");

  const readStream = fsStream.createReadStream(filePath);
  readStream.on("error", (error) => {
    console.error("Error serving 404 page:", error);
    res.setHeader("Content-Type", "text/plain");
    res.end("404 - Not Found");
  });

  readStream.pipe(res);
}

async function serveStaticFile(filePath, res) {
  try {
    const stat = await fsStream.promises.lstat(filePath);

    if (stat.isDirectory()) {
      throw new Error("EISDIR");
    }

    const fileStream = fsStream.createReadStream(filePath);
    const ext = path.extname(filePath);
    const mimeType = mimeTypes[ext] || "application/octet-stream";

    res.setHeader("Content-Type", mimeType);
    fileStream.pipe(res);

    fileStream.on("error", (error) => {
      console.error("Error serving static file:", error);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    });
  } catch (error) {
    if (error.message === "EISDIR" || error.code === "ENOENT") {
      console.error("Error serving static file:", error);
      serve404(res);
    } else {
      console.error("Unexpected error serving static file:", error);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    }
  }
}

module.exports = { serve404, mimeTypes, serveStaticFile };
